/**
 * Publica los fuentes de cada contrato Stylus en su repo espejo público de GitHub
 * para que Arbiscan (Etherscan v2) pueda verificar el contrato.
 *
 *   yarn ts-node scripts/sync-mirrors.ts [--contract treasury_vault] [--force] [--skip] [--dry-run]
 *
 * Etherscan clona la URL de `sourceCode` y corre `cargo metadata` desde la RAÍZ
 * del clonado. El monorepo no sirve:
 *   - con el workspace en la raíz verifica el primer paquete alfabético;
 *   - sin Cargo.toml en la raíz falla con "could not find Cargo.toml".
 * Por eso cada contrato se publica en un repo propio con su Cargo.toml en la raíz.
 *
 * Sin argumentos publica los 3 repos. `--force` fuerza el push aunque el repo ya
 * tenga historial. Si el repo no existe y no hay `gh` CLI, se avisa para crearlo
 * a mano (una sola vez).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { MIRRORS, REPO_ROOT, STYLUS_ROOT, ContractMirror } from "./mirrors";

interface SyncOptions {
  contract?: string;
  force?: boolean;
  skip?: boolean;
  dryRun?: boolean;
}

function git(args: string[], cwd: string, allowUserError = false): { ok: boolean; out: string; err: string } {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    if (!allowUserError) {
      console.error(`   git ${args.join(" ")} falló:\n${res.stderr}`);
    }
  }
  return { ok: res.status === 0, out: res.stdout ?? "", err: res.stderr ?? "" };
}

function repoExists(repoUrl: string): boolean {
  const res = spawnSync(
    "git",
    ["ls-remote", "--heads", `${repoUrl}.git`, `refs/heads/main`],
    {
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  // exit 0 => remoto accesible; exit 128 => repo inexistente/privado.
  // Un repo recién creado aún no tiene main, pero si el remote es alcanzable existe.
  return res.status === 0;
}

/** Crea el repo remoto en GitHub si `gh` está disponible. */
function ensureRemote(repoUrl: string): boolean {
  const gh = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (gh.status !== 0) return false;
  const rest = repoUrl.replace(/^https:\/\/github\.com\//, "");
  const parts = rest.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const res = spawnSync("gh", ["repo", "create", `${parts[0]}/${parts[1]}`, "--public"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  return res.status === 0;
}

/** Arma el árbol espejo: contenido del contrato en la raíz + toolchain/Stylus.toml. */
function buildMirror(contract: ContractMirror): string | null {
  const srcDir = path.resolve(STYLUS_ROOT, contract.contractDir);
  if (!fs.existsSync(path.join(srcDir, "Cargo.toml"))) {
    console.error(`   ❌ No existe ${path.join(srcDir, "Cargo.toml")}`);
    return null;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "otter-mirror-"));
  fs.cpSync(srcDir, tmp, { recursive: true });
  for (const f of ["rust-toolchain.toml", "Stylus.toml"]) {
    const from = path.resolve(REPO_ROOT, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(tmp, f));
  }
  return tmp;
}

async function syncOne(contract: ContractMirror, opts: SyncOptions): Promise<boolean> {
  // 1) Asegurar que el repo remoto existe.
  if (opts.skip) {
    console.log("   --skip: no se comprueba el repo remoto.");
  } else if (repoExists(contract.repoUrl)) {
    console.log(`   El repo remoto ya existe (${contract.repoUrl}).`);
  } else {
    console.log(`   El repo remoto ${contract.repoUrl} no existe todavía.`);
    if (!ensureRemote(contract.repoUrl)) {
      console.log(
        "   No se pudo crearlo automáticamente (falta 'gh' o sesión). Crealo una vez en",
      );
      console.log("   https://github.com/new (público, sin README) y vuelve a correr.");
      return false;
    }
    console.log("   ✔ Repo remoto creado.");
  }

  // 2. Construir el mirrorio local.
  const tmp = buildMirror(contract);
  if (!tmp) return false;

  if (opts.dryRun) {
    console.log(`   [dry-run] fuentes listas en ${tmp}, no se pushea a ${contract.repoUrl}`);
    return true;
  }

  const commitMsg = `chore(stylus): sync ${contract.contractName} para verificación Arbiscan`;
  const steps: string[][] = [
    ["init", "-b", contract.branch],
    ["config", "user.email", "otterpot@zer0-knowledge.xyz"],
    ["config", "user.name", "otterpot-sync"],
    ["add", "-A"],
  ];
  for (const args of steps) {
    const r = git(args, tmp);
    if (!r.ok) return false;
  }
  const commit = git(["commit", "-m", commitMsg], tmp, true);
  if (!commit.ok) {
    console.error(`   ❌ Falló el commit (¿hay cambios?): ${commit.err}`);
    return false;
  }

  // 3. Publicar.
  const pushArgs = ["push", `${contract.repoUrl}.git`, `HEAD:${contract.branch}`];
  if (opts.force) pushArgs.push("--force");
  const push = spawnSync("git", pushArgs, { encoding: "utf8", cwd: tmp, timeout: 120_000 });
  if (push.status !== 0) {
    console.error(`   ❌ Push falló:\n${push.stderr}`);
    return false;
  }
  console.log(`\n   ✔ ${contract.name} publicado en ${contract.repoUrl} (${contract.branch})`);
  return true;
}

function parseArgs(argv: string[]): SyncOptions {
  const opts: SyncOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--contract") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) opts.contract = next;
    } else if (a === "--force") opts.force = true;
    else if (a === "--skip") opts.skip = true;
    else if (a === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

async function main(): Promise<void> {
  console.log("🔍 Sincronizando repos espejo para verificación Stylus...");
  const opts = parseArgs(process.argv.slice(2));
  const targets =
    opts.contract !== undefined
      ? MIRRORS.filter((m) => m.contractName === opts.contract || m.name === opts.contract)
      : MIRRORS;

  if (targets.length === 0) {
    console.error("   ❌ No se encontró el contrato indicado.");
    process.exitCode = 1;
    return;
  }

  for (const contract of targets) {
    console.log(`\n▶ ${contract.name} (${contract.contractName})`);
    await syncOne(contract, opts);
  }
  console.log("\n✨ Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
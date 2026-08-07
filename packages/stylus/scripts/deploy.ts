/**
 * Despliegue completo de OtterPot en UN comando:
 *
 *   yarn workspace @ss/stylus deploy [--network local|sepolia]
 *
 * Hace, en orden:
 *   1. Deploy de los contratos (vía `cargo stylus deploy` dentro de WSL,
 *      porque en esta máquina cargo solo vive en WSL).
 *        - local  : mock_usdc + treasury_vault + challenge_pool
 *        - sepolia: treasury_vault + challenge_pool (sin mock, USDC real)
 *   2. Guarda las direcciones en deployments/<chainId>_latest.json.
 *   3. Init automático: TreasuryVault.init(usdc) y
 *      ChallengePool.init(vault, usdc, commissionBps).
 *
 * Todo el flujo es un solo comando; no hacen falta pasos extra.
 */

import { ethers } from "ethers";
import type { ContractTransactionResponse, JsonRpcProvider, Wallet } from "ethers";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { arbitrumNitro } from "../../nextjs/utils/scaffold-stylus/supportedChains";
import { parseArgs, resolveTarget } from "./otter";
import { getPrivateKey } from "./utils/network";
import { extractDeploymentInfo } from "./utils/contract";

const RATE_BPS = 500n; // 500 bps = 5 %
// Techo de gas por gas (gwei). En testnets la base fee puede subir por encima del
// default de cargo stylus (0.02 gwei); este techo es solo un límite (se paga la
// base fee real). Se ajusta con la env OTT_DEPLOY_MAXFEE_GWEI o flag --max-fee.
const DEFAULT_MAX_FEE_GWEI = "1";

const VAULT_ABI = ["function init(address) returns (bool)"] as const;
const POOL_ABI = ["function init(address,address,uint256) returns (bool)"] as const;

interface InitVault {
  connect(signer: Wallet): InitVault;
  init(usdc: string): Promise<ContractTransactionResponse>;
}
interface InitPool {
  connect(signer: Wallet): InitPool;
  init(vault: string, usdc: string, rate: bigint): Promise<ContractTransactionResponse>;
}

const LINUX_CONTRACTS = path
  .resolve(__dirname, "../contracts")
  .replace(/^([A-Za-z]):\\/, (_: string, d: string) => `/mnt/${d.toLowerCase()}/`)
  .replace(/\\/g, "/");

const TMP_WORKSPACE = "/tmp/otter-deploy";

function runWsl(script: string): string {
  return execFileSync("wsl", ["bash", "-lc", script], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}

async function cargoDeploy(
  name: string,
  rpc: string,
  privateKey: string,
  maxFeeGwei: string,
): Promise<string> {
  console.log(`\n🚀 Desplegando ${name}…`);
  // Copia limpia del source a disco nativo de WSL (evita la lentitud del mount 9p
  // y garantiza una única raíz de workspace antes de compilar).
  const script = [
    `rm -rf ${TMP_WORKSPACE}/work`,
    `mkdir -p ${TMP_WORKSPACE}/work`,
    `cp -r '${LINUX_CONTRACTS}' ${TMP_WORKSPACE}/work/`,
    `cd ${TMP_WORKSPACE}/work/contracts/${name}`,
    `cargo stylus deploy --endpoint '${rpc}' --private-key '${privateKey}' --no-verify --max-fee-per-gas-gwei=${maxFeeGwei}`,
  ].join(" && ");
  const out = runWsl(script);
  const info = extractDeploymentInfo(out);
  if (!info) {
    throw new Error(
      `No se pudo extraer la dirección de ${name}. Salida:\n${out.slice(-2000)}`,
    );
  }
  console.log(`  ✔ ${name} → ${info.address}`);
  return info.address;
}

async function initContracts(
  owner: Wallet,
  usdcAddr: string,
  vaultAddr: string,
  poolAddr: string,
): Promise<void> {
  const vault: InitVault = new ethers.Contract(vaultAddr, VAULT_ABI, owner) as unknown as InitVault;
  const pool: InitPool = new ethers.Contract(poolAddr, POOL_ABI, owner) as unknown as InitPool;

  for (const step of [
    ["TreasuryVault.init(usdc)", () => vault.init(usdcAddr)],
    ["ChallengePool.init(vault, usdc, rate)", () => pool.init(vaultAddr, usdcAddr, RATE_BPS)],
  ] as const) {
    const [label, run] = step;
    console.log(`\n── ${label} ──`);
    try {
      const tx = await run();
      const receipt = await tx.wait();
      if (!receipt) throw new Error("sin receipt");
      console.log(`  ✔ ok (tx ${receipt.hash})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.log(`  ⚠ ${msg} (¿ya estaba inicializado?)`);
    }
  }
}

export default async function deployScript(
  opts: { network?: string; net?: string } = {},
): Promise<void> {
  const raw = parseArgs(process.argv.slice(2));
  const network = opts.network ?? opts.net ?? raw["network"] ?? raw["net"];
  const target = resolveTarget({ ...raw, ...(network ? { network } : {}) });
  const chainId = target.chainId;

  const privateKey =
    (target.isLocal
      ? (arbitrumNitro.accounts[0] as { privateKey?: string }).privateKey ?? ""
      : getPrivateKey("arbitrumSepolia")).trim() ?? "";
  if (!privateKey) throw new Error("Falta la clave privada para el deploy");
  // cargo stylus / ethers esperan 0x + 64 hex; aceptamos también 64 hex sin 0x.
  const normalizedKey =
    (privateKey.startsWith("0x") || privateKey.startsWith("0X")
      ? privateKey
      : "0x" + privateKey).toLowerCase();

  if (!target.isLocal) {
    const derived = new ethers.Wallet(normalizedKey).address;
    const expected = process.env["ACCOUNT_ADDRESS_SEPOLIA"];
    if (expected && expected.toLowerCase() !== derived.toLowerCase()) {
      throw new Error(
        `La PRIVATE_KEY_SEPOLIA no corresponde a ACCOUNT_ADDRESS_SEPOLIA (derivada ${derived})`,
      );
    }
    console.log(`   Owner: ${derived}  bal: ${(await new ethers.JsonRpcProvider(target.rpc).getBalance(derived)).toString()} wei`);
  }

  const contracts = target.isLocal
    ? ["mock_usdc", "treasury_vault", "challenge_pool"]
    : ["treasury_vault", "challenge_pool"];

  console.log("==========================================================");
  console.log("   OtterPot — deploy completo");
  console.log(`   Red: ${target.isLocal ? "local (Nitro DevNode)" : "testnet"}  chainId=${chainId}`);
  console.log(`   RPC: ${target.rpc}`);
  console.log(`   Contratos: ${contracts.join(", ")}`);
  console.log("==========================================================");

  // 1) Deploy secuencial vía cargo stylus en WSL.
  const maxFeeGwei =
    raw["max-fee"] ?? process.env["OTT_DEPLOY_MAXFEE_GWEI"] ?? DEFAULT_MAX_FEE_GWEI;
  const record: Record<string, { address: string }> = {};
  for (const name of contracts) {
    const address = await cargoDeploy(name, target.rpc, normalizedKey, maxFeeGwei);
    record[name] = { address };
  }

  // 2) Guardar en deployments/<chainId>_latest.json.
  const deployDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
  const file = path.join(deployDir, `${chainId}_latest.json`);
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      /* se sobreescribe */
    }
  }
  const merged = { ...existing, ...record };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  console.log(`\n💾 Direcciones guardadas en ${file}`);

  // 3) Init automático.
  const usdcAddr =
    record["mock_usdc"]?.address ??
    raw["usdc"] ??
    process.env["USDC_ADDRESS"] ??
    undefined;
  const vaultAddr = record["treasury_vault"]?.address;
  const poolAddr = record["challenge_pool"]?.address;

  if (!usdcAddr || !vaultAddr || !poolAddr) {
    console.error("\n❌ No se pudo inicializar: faltan direcciones de USDC/vault/pool.");
    console.error("   En testnet pasa el USDC con --usdc o la variable USDC_ADDRESS.");
    process.exit(1);
  }

  const provider: JsonRpcProvider = new ethers.JsonRpcProvider(target.rpc);
  const owner = new ethers.Wallet(normalizedKey, provider);

  console.log("\nInicializando contratos…");
  await initContracts(owner, usdcAddr, vaultAddr, poolAddr);

  console.log("\n==========================================================");
  console.log("   Resumen del deploy");
  for (const name of contracts) {
    console.log(`   · ${name}: ${record[name]!.address}`);
  }
  console.log(`   · USDC: ${usdcAddr}`);
  console.log("   ✅ Listo. Los contratos están desplegados e inicializados.");
  console.log("==========================================================");
}
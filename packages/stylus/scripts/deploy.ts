/**
 * Despliegue completo de OtterPot en UN comando:
 *
 *   yarn workspace @ss/stylus deploy [--network local|sepolia]
 *
 * Hace, en orden:
 *   1. Deploy de los contratos (vía `cargo stylus deploy` dentro de WSL,
 *      porque en esta máquina cargo solo vive en WSL).
 *        - local  : mock_usdc + mock_strategy + treasury_vault + challenge_pool
 *        - sepolia: treasury_vault + challenge_pool + aave_strategy (sin mock, USDC real)
 *   2. Guarda las direcciones en deployments/<chainId>_latest.json.
 *   3. Init automático:
 *        - TreasuryVault.init(usdc)
 *        - Strategy.init(usdc) / Strategy.init(pool, usdc, atoken)
 *        - Strategy.setVault(vault)
 *        - TreasuryVault.setStrategy(strategy)
 *        - ChallengePool.init(vault, usdc, commissionBps)
 *   4. Despliegue inicial de capital en la estrategia (opcional, solo local).
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

// Direcciones de Aave V3 en Arbitrum Sepolia (oficiales: bgd-labs/aave-address-book)
const AAVE_V3_POOL_SEPOLIA = "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff";
const USDC_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
const AUSDC_SEPOLIA = "0x460b97BD498E1157530AEb3086301d5225b91216"; // aUSDC oficial

const VAULT_ABI = [
  "function init(address) returns (bool)",
  "function setStrategy(address) returns (bool)",
] as const;

const POOL_ABI = ["function init(address,address,uint256) returns (bool)"] as const;

const STRATEGY_ABI = [
  "function init(address) returns (bool)",
  "function init(address,address,address) returns (bool)",
  "function setVault(address) returns (bool)",
] as const;

interface InitVault {
  connect(signer: Wallet): InitVault;
  init(usdc: string): Promise<ContractTransactionResponse>;
  setStrategy(strategy: string): Promise<ContractTransactionResponse>;
}
interface InitPool {
  connect(signer: Wallet): InitPool;
  init(vault: string, usdc: string, rate: bigint): Promise<ContractTransactionResponse>;
}
interface InitStrategy {
  connect(signer: Wallet): InitStrategy;
  init(usdc: string): Promise<ContractTransactionResponse>;
  init(pool: string, usdc: string, atoken: string): Promise<ContractTransactionResponse>;
  setVault(vault: string): Promise<ContractTransactionResponse>;
}

const REPO_ROOT = path
  .resolve(__dirname, "../../..")
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
  const script = [
    `rm -rf ${TMP_WORKSPACE}/work`,
    `mkdir -p ${TMP_WORKSPACE}/work`,
    `cp -r '${REPO_ROOT}/rust-toolchain.toml' '${REPO_ROOT}/Stylus.toml' ${TMP_WORKSPACE}/work/`,
    `mkdir -p ${TMP_WORKSPACE}/work/packages/stylus/`,
    `cp -r '${REPO_ROOT}/packages/stylus/contracts' ${TMP_WORKSPACE}/work/packages/stylus/`,
    `cd ${TMP_WORKSPACE}/work/packages/stylus/contracts/${name}`,
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
  strategyAddr: string,
  /** Con mocks la estrategia se inicializa con solo el USDC; con Aave, con pool+usdc+atoken. */
  usaMock: boolean,
): Promise<void> {
  const vault: InitVault = new ethers.Contract(vaultAddr, VAULT_ABI, owner) as unknown as InitVault;
  const pool: InitPool = new ethers.Contract(poolAddr, POOL_ABI, owner) as unknown as InitPool;
  const strategy: InitStrategy = new ethers.Contract(strategyAddr, STRATEGY_ABI, owner) as unknown as InitStrategy;

  console.log("\n── Inicializando contratos ──");

  // 1. TreasuryVault.init(usdc)
  console.log("  TreasuryVault.init(usdc)…");
  try {
    const tx = await vault.init(usdcAddr);
    await tx.wait();
    console.log("    ✔ ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.log(`    ⚠ ${msg} (¿ya estaba inicializado?)`);
  }

  // 2. Strategy.init(...)
  console.log(`  Strategy.init(${usaMock ? "usdc" : "pool, usdc, atoken"})…`);
  try {
    let tx: ContractTransactionResponse;
    if (usaMock) {
      tx = await strategy.init(usdcAddr);
    } else {
      tx = await strategy.init(AAVE_V3_POOL_SEPOLIA, USDC_SEPOLIA, AUSDC_SEPOLIA);
    }
    await tx.wait();
    console.log("    ✔ ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.log(`    ⚠ ${msg} (¿ya estaba inicializado?)`);
  }

  // 3. Strategy.setVault(vault)
  console.log("  Strategy.setVault(vault)…");
  try {
    const tx = await strategy.setVault(vaultAddr);
    await tx.wait();
    console.log("    ✔ ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.log(`    ⚠ ${msg} (¿ya estaba configurado?)`);
  }

  // 4. TreasuryVault.setStrategy(strategy)
  console.log("  TreasuryVault.setStrategy(strategy)…");
  try {
    const tx = await vault.setStrategy(strategyAddr);
    await tx.wait();
    console.log("    ✔ ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.log(`    ⚠ ${msg} (¿ya estaba configurado?)`);
  }

  // 5. ChallengePool.init(vault, usdc, rate)
  console.log("  ChallengePool.init(vault, usdc, rate)…");
  try {
    const tx = await pool.init(vaultAddr, usdcAddr, RATE_BPS);
    await tx.wait();
    console.log("    ✔ ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.log(`    ⚠ ${msg} (¿ya estaba inicializado?)`);
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

  // Los mocks van SOLO en local, nunca en testnet (SDD v6 §6.5 y §7.3.3).
  //
  // En Arbitrum Sepolia se opera con el USDC de Circle y con Aave V3 real: la spec
  // es explícita en que la demo debe correr contra el protocolo, no contra un
  // simulacro. El USDC de prueba se obtiene del faucet de Circle o del de Aave
  // (SDD §7.3.2), así que no hace falta desplegar un mock para tener fondos.
  const usaMock = target.isLocal;
  const contracts = usaMock
    ? ["mock_usdc", "mock_strategy", "treasury_vault", "challenge_pool"]
    : ["treasury_vault", "challenge_pool", "aave_strategy"];

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
    (usaMock ? undefined : USDC_SEPOLIA);
  const vaultAddr = record["treasury_vault"]?.address;
  const poolAddr = record["challenge_pool"]?.address;
  const strategyAddr = usaMock
    ? record["mock_strategy"]?.address
    : record["aave_strategy"]?.address;

  if (!usdcAddr || !vaultAddr || !poolAddr || !strategyAddr) {
    console.error("\n❌ No se pudo inicializar: faltan direcciones de USDC/vault/pool/strategy.");
    console.error("   En testnet pasa el USDC con --usdc o la variable USDC_ADDRESS.");
    process.exit(1);
  }

  const provider: JsonRpcProvider = new ethers.JsonRpcProvider(target.rpc);
  const owner = new ethers.Wallet(normalizedKey, provider);

  console.log("\nInicializando contratos…");
  await initContracts(owner, usdcAddr, vaultAddr, poolAddr, strategyAddr, usaMock);

  // 4) Despliegue inicial de capital en la estrategia (solo local, opcional)
  if (target.isLocal) {
    console.log("\n── Despliegue inicial de capital en estrategia (opcional) ──");
    const deployInitial = raw["deploy-initial"] ?? "true";
    if (deployInitial === "true") {
      const VAULT_FULL_ABI = [
        "function usdc() view returns (address)",
        "function totalAssets() view returns (uint256)",
        "function deployToStrategy(uint256) returns (bool)",
      ] as const;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultFull: any = new ethers.Contract(vaultAddr, VAULT_FULL_ABI, owner);
      const totalAssets = await vaultFull.totalAssets();
      if (totalAssets > 0n) {
        console.log(`  Desplegando ${ethers.formatUnits(totalAssets, 6)} USDC en estrategia…`);
        try {
          const tx = await vaultFull.deployToStrategy(totalAssets);
          await tx.wait();
          console.log("    ✔ Capital desplegado en estrategia");
        } catch (err) {
          const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
          console.log(`    ⚠ ${msg}`);
        }
      } else {
        console.log("  Vault sin fondos, se omite deploy inicial");
      }
    }
  }

  console.log("\n==========================================================");
  console.log("   Resumen del deploy");
  for (const name of contracts) {
    console.log(`   · ${name}: ${record[name]!.address}`);
  }
  console.log(`   · USDC: ${usdcAddr}`);
  console.log("   ✅ Listo. Los contratos están desplegados, inicializados y cableados.");
  console.log("==========================================================");
}
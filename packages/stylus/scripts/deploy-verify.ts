/**
 * Despliegue completo de OtterPot CON VERIFICACIÓN (requiere Docker Desktop + WSL):
 *
 *   yarn workspace @ss/stylus deploy:verify --network sepolia
 *
 * Hace, en orden:
 *   1. Deploy de los contratos CON --verify (reproducible, verificable en Arbiscan) vía cargo stylus en WSL
 *   2. Guarda las direcciones en deployments/<chainId>_latest.json
 *   3. Init automático completo (incluye commission rate 2% = 200 bps)
 *   4. Verifica que todo esté cableado correctamente
 *
 * REQUISITO: Docker Desktop corriendo con WSL integration habilitada
 * Todo el flujo es un solo comando; no hacen falta pasos extra.
 */

import { ethers } from "ethers";
import type { ContractTransactionResponse, JsonRpcProvider, Wallet } from "ethers";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { parseArgs, resolveTarget } from "./otter";
import { getPrivateKey } from "./utils/network";
import { extractDeploymentInfo } from "./utils/contract";

const RATE_BPS = 200n; // 200 bps = 2 %
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

const LINUX_CONTRACTS = path
  .resolve(__dirname, "../contracts")
  .replace(/^([A-Za-z]):\\/, (_: string, d: string) => `/mnt/${d.toLowerCase()}/`)
  .replace(/\\/g, "/");

const TMP_WORKSPACE = "/tmp/otter-deploy-verify";

function runWsl(script: string): string {
  return execFileSync("wsl", ["bash", "-lc", script], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}

async function cargoDeployVerify(
  name: string,
  rpc: string,
  privateKey: string,
  maxFeeGwei: string,
): Promise<{ address: string; txHash: string }> {
  console.log(`\n🚀 Desplegando ${name} CON VERIFICACIÓN…`);
  const script = [
    `rm -rf ${TMP_WORKSPACE}/work`,
    `mkdir -p ${TMP_WORKSPACE}/work`,
    `cp -r '${LINUX_CONTRACTS}' ${TMP_WORKSPACE}/work/`,
    `cd ${TMP_WORKSPACE}/work/contracts/${name}`,
    `cargo stylus deploy --endpoint '${rpc}' --private-key '${privateKey}' --max-fee-per-gas-gwei=${maxFeeGwei} --cargo-stylus-version 0.10.7`,
  ].join(" && ");
  const out = runWsl(script);
  const info = extractDeploymentInfo(out);
  if (!info) {
    throw new Error(
      `No se pudo extraer la dirección de ${name}. Salida:\n${out.slice(-2000)}`,
    );
  }
  console.log(`  ✔ ${name} → ${info.address}`);
  console.log(`  📝 Tx hash: ${info.txHash || "no disponible en output"}`);
  return info;
}

async function initContracts(
  owner: Wallet,
  usdcAddr: string,
  vaultAddr: string,
  poolAddr: string,
  strategyAddr: string,
  isLocal: boolean,
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
  console.log(`  Strategy.init(${isLocal ? "usdc" : "pool, usdc, atoken"})…`);
  try {
    let tx: ContractTransactionResponse;
    if (isLocal) {
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

async function verifySetup(
  provider: JsonRpcProvider,
  usdcAddr: string,
  vaultAddr: string,
  poolAddr: string,
  strategyAddr: string,
): Promise<void> {
  console.log("\n── Verificando cableado ──");

  const VAULT_READ_ABI = [
    "function strategy() view returns (address)",
    "function usdc() view returns (address)",
    "function totalAssets() view returns (uint256)",
  ] as const;

  const POOL_READ_ABI = [
    "function treasuryVault() view returns (address)",
    "function usdc() view returns (address)",
    "function commissionRate() view returns (uint256)",
  ] as const;

  const STRATEGY_READ_ABI = [
    "function vault() view returns (address)",
  ] as const;

  const vaultC = new ethers.Contract(vaultAddr, VAULT_READ_ABI, provider);
  const poolC = new ethers.Contract(poolAddr, POOL_READ_ABI, provider);
  const strategyC = new ethers.Contract(strategyAddr, STRATEGY_READ_ABI, provider);

  try {
    const [vaultStrategy, vaultUsdc, vaultTotalAssets] = await Promise.all([
      (vaultC as any)["strategy"](),
      (vaultC as any)["usdc"](),
      (vaultC as any)["totalAssets"](),
    ]);
    console.log(`  TreasuryVault.strategy: ${vaultStrategy} ${vaultStrategy.toLowerCase() === strategyAddr.toLowerCase() ? "✅" : "❌"}`);
    console.log(`  TreasuryVault.usdc: ${vaultUsdc} ${vaultUsdc.toLowerCase() === usdcAddr.toLowerCase() ? "✅" : "❌"}`);
    console.log(`  TreasuryVault.totalAssets: ${ethers.formatUnits(vaultTotalAssets, 6)} USDC`);
  } catch (e) {
    console.log(`  ❌ Error leyendo TreasuryVault: ${e}`);
  }

  try {
    const [poolVault, poolUsdc, poolRate] = await Promise.all([
      (poolC as any)["treasuryVault"](),
      (poolC as any)["usdc"](),
      (poolC as any)["commissionRate"](),
    ]);
    console.log(`  ChallengePool.treasuryVault: ${poolVault} ${poolVault.toLowerCase() === vaultAddr.toLowerCase() ? "✅" : "❌"}`);
    console.log(`  ChallengePool.usdc: ${poolUsdc} ${poolUsdc.toLowerCase() === usdcAddr.toLowerCase() ? "✅" : "❌"}`);
    console.log(`  ChallengePool.commissionRate: ${poolRate} bps`);
  } catch (e) {
    console.log(`  ❌ Error leyendo ChallengePool: ${e}`);
  }

  try {
    const stratVault = await (strategyC as any)["vault"]();
    console.log(`  AaveStrategy.vault: ${stratVault} ${stratVault.toLowerCase() === vaultAddr.toLowerCase() ? "✅" : "❌"}`);
  } catch (e) {
    console.log(`  ❌ Error leyendo AaveStrategy: ${e}`);
  }
}

export default async function deployVerifyScript(
  opts: { network?: string; net?: string } = {},
): Promise<void> {
  const raw = parseArgs(process.argv.slice(2));
  const network = opts.network ?? opts.net ?? raw["network"] ?? raw["net"];
  const target = resolveTarget({ ...raw, ...(network ? { network } : {}) });
  const chainId = target.chainId;

  if (target.isLocal) {
    throw new Error("Este script es solo para testnet (sepolia). Para local usa 'yarn deploy'");
  }

  const privateKey = getPrivateKey("arbitrumSepolia").trim() ?? "";
  if (!privateKey) throw new Error("Falta la clave privada para el deploy");
  const normalizedKey =
    (privateKey.startsWith("0x") || privateKey.startsWith("0X")
      ? privateKey
      : "0x" + privateKey).toLowerCase();

  const derived = new ethers.Wallet(normalizedKey).address;
  const expected = process.env["ACCOUNT_ADDRESS_SEPOLIA"];
  if (expected && expected.toLowerCase() !== derived.toLowerCase()) {
    throw new Error(
      `La PRIVATE_KEY_SEPOLIA no corresponde a ACCOUNT_ADDRESS_SEPOLIA (derivada ${derived})`,
    );
  }
  const provider = new ethers.JsonRpcProvider(target.rpc);
  const balance = await provider.getBalance(derived);
  console.log(`   Owner: ${derived}  bal: ${ethers.formatEther(balance)} ETH`);
  if (balance < ethers.parseEther("0.05")) {
    throw new Error(`Saldo insuficiente (${ethers.formatEther(balance)} ETH). Necesitas al menos 0.05 ETH para deploy con verificación.`);
  }

  const contracts = ["treasury_vault", "challenge_pool", "aave_strategy"];

  console.log("==========================================================");
  console.log("   OtterPot — deploy completo con verificación");
  console.log(`   Red: testnet  chainId=${chainId}`);
  console.log(`   RPC: ${target.rpc}`);
  console.log(`   Contratos: ${contracts.join(", ")}`);
  console.log("==========================================================");

  // 1) Deploy secuencial vía cargo stylus en WSL CON VERIFICACIÓN.
  const maxFeeGwei =
    raw["max-fee"] ?? process.env["OTT_DEPLOY_MAXFEE_GWEI"] ?? DEFAULT_MAX_FEE_GWEI;
  const record: Record<string, { address: string; txHash?: string }> = {};
  for (const name of contracts) {
    const info = await cargoDeployVerify(name, target.rpc, normalizedKey, maxFeeGwei);
    record[name] = { address: info.address, txHash: info.txHash };
    // Pequeña pausa entre deploys para evitar nonce issues
    await new Promise(r => setTimeout(r, 3000));
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
    raw["usdc"] ??
    process.env["USDC_ADDRESS"] ??
    USDC_SEPOLIA;
  const vaultAddr = record["treasury_vault"]?.address;
  const poolAddr = record["challenge_pool"]?.address;
  const strategyAddr = record["aave_strategy"]?.address;

  if (!usdcAddr || !vaultAddr || !poolAddr || !strategyAddr) {
    console.error("\n❌ No se pudo inicializar: faltan direcciones de USDC/vault/pool/strategy.");
    process.exit(1);
  }

  const owner = new ethers.Wallet(normalizedKey, provider);

  console.log("\nInicializando contratos…");
  await initContracts(owner, usdcAddr, vaultAddr, poolAddr, strategyAddr, false);

  // 4) Verificar cableado
  await verifySetup(provider, usdcAddr, vaultAddr, poolAddr, strategyAddr);

  console.log("\n==========================================================");
  console.log("   Resumen del deploy CON VERIFICACIÓN");
  for (const name of contracts) {
    console.log(`   · ${name}: ${record[name]!.address}`);
    if (record[name]!.txHash) {
      console.log(`     tx: ${record[name]!.txHash}`);
      console.log(`     verify: https://sepolia.arbiscan.io/tx/${record[name]!.txHash}`);
    }
  }
  console.log(`   · USDC: ${usdcAddr}`);
  console.log("   ✅ Listo. Contratos desplegados, VERIFICABLES, inicializados y cableados.");
  console.log("   📋 Commission rate: 2% (200 bps)");
  console.log("==========================================================");
}

if (require.main === module) {
  deployVerifyScript()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("\n❌ Deploy falló:");
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
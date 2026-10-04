/**
 * Inicializa los contratos de OtterPot.
 *
 * En producción esta tarea la hace el Worker; este script la replica para
 * pruebas y para el bootstrap manual de un entorno:
 *   1. TreasuryVault.init(usdc)
 *   2. Strategy.init(usdc) / Strategy.init(pool, usdc, atoken)
 *   3. Strategy.setVault(vault)
 *   4. TreasuryVault.setStrategy(strategy)
 *   5. ChallengePool.init(vault, usdc, commissionBps)
 *
 * Objetivos soportados (ver scripts/otter.ts):
 *   - local  : Nitro DevNode (chain 412346). Cuentas de arbitrumNitro.accounts,
 *              USDC mock desde deployments/412346_latest.json.
 *   - sepolia: Arbitrum Sepolia. Firmante owner desde PRIVATE_KEY_SEPOLIA,
 *              dirección de USDC real desde --usdc o USDC_ADDRESS.
 *
 * Uso:
 *   yarn workspace @ss/stylus setup:contracts [--network local|sepolia]
 *       [--rpc <url>] [--chain-id <id>] [--usdc <addr>] [--vault <addr>]
 *       [--pool <addr>] [--strategy <addr>] [--rate <bps>]
 */

import { ethers } from "ethers";
import type { ContractTransactionResponse, Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { parseArgs, resolveTarget, getSigner, LOCAL_CHAIN_ID } from "./otter";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const AAVE_V3_POOL_SEPOLIA = "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff";
const USDC_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
const AUSDC_SEPOLIA = "0x460b97BD498E1157530AEb3086301d5225b91216"; // aUSDC oficial

const POOL_ABI = [
  "function init(address,address,uint256) returns (bool)",
] as const;

const VAULT_ABI = [
  "function init(address) returns (bool)",
  "function setStrategy(address) returns (bool)",
] as const;

const STRATEGY_ABI = [
  "function init(address) returns (bool)",
  "function init(address,address,address) returns (bool)",
  "function setVault(address) returns (bool)",
] as const;

interface InitPool {
  connect(signer: Wallet): InitPool;
  init(vault: string, usdc: string, rate: bigint, overrides?: ethers.Overrides): Promise<ContractTransactionResponse>;
}
interface InitVault {
  connect(signer: Wallet): InitVault;
  init(usdc: string, overrides?: ethers.Overrides): Promise<ContractTransactionResponse>;
  setStrategy(strategy: string, overrides?: ethers.Overrides): Promise<ContractTransactionResponse>;
}
interface InitStrategy {
  connect(signer: Wallet): InitStrategy;
  init(usdc: string, overrides?: ethers.Overrides): Promise<ContractTransactionResponse>;
  init(pool: string, usdc: string, atoken: string, overrides?: ethers.Overrides): Promise<ContractTransactionResponse>;
  setVault(vault: string, overrides?: ethers.Overrides): Promise<ContractTransactionResponse>;
}

function resolveAddress(flag: string | undefined, envName: string, chainId: number, deployKey: string): string | undefined {
  if (flag) return flag;
  if (chainId === LOCAL_CHAIN_ID || deployKey.startsWith("mock_")) {
    const file = path.resolve(__dirname, `../deployments/${chainId}_latest.json`);
    if (fs.existsSync(file)) {
      try {
        const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        const record = data as Record<string, { address?: unknown }>;
        const entry = record[deployKey];
        if (entry && typeof entry.address === "string") return entry.address;
      } catch {
        /* deployments opcional */
      }
    }
  }
  if (process.env[envName]) return process.env[envName];
  const file = path.resolve(__dirname, `../deployments/${chainId}_latest.json`);
  if (fs.existsSync(file)) {
    try {
      const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      const record = data as Record<string, { address?: unknown }>;
      const entry = record[deployKey];
      if (entry && typeof entry.address === "string") return entry.address;
    } catch {
      /* deployments opcional */
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);
  const rateBps = BigInt(args["rate"] ?? "500"); // 500 bps = 5 %

  const usdcAddr = resolveAddress(args["usdc"], "USDC_ADDRESS", target.chainId, "mock_usdc");
  const poolAddr = resolveAddress(args["pool"], "POOL_ADDRESS", target.chainId, "challenge_pool");
  const vaultAddr = resolveAddress(args["vault"], "VAULT_ADDRESS", target.chainId, "treasury_vault");
  const strategyAddr = resolveAddress(args["strategy"], "STRATEGY_ADDRESS", target.chainId, target.isLocal ? "mock_strategy" : "aave_strategy");

  for (const [name, addr] of [
    ["USDC", usdcAddr],
    ["ChallengePool", poolAddr],
    ["TreasuryVault", vaultAddr],
    ["Strategy", strategyAddr],
  ] as const) {
    if (!addr) throw new Error(`Falta dirección de ${name}: pásala con --usdc/--pool/--vault/--strategy, con su variable de entorno o despliega antes los contratos`);
  }

  const provider = new ethers.JsonRpcProvider(target.rpc);
  const owner = getSigner(target, "owner", provider);

  console.log(`Red: ${target.isLocal ? "local (Nitro DevNode)" : "testnet"}  chainId=${target.chainId}  rpc=${target.rpc}`);
  console.log(`owner: ${owner.address}`);
  console.log(`usdc=${usdcAddr}  vault=${vaultAddr}  pool=${poolAddr}  strategy=${strategyAddr}  rateBps=${rateBps}`);

  const vault: InitVault = new ethers.Contract(vaultAddr!, VAULT_ABI, owner) as unknown as InitVault;
  const pool: InitPool = new ethers.Contract(poolAddr!, POOL_ABI, owner) as unknown as InitPool;
  const strategy: InitStrategy = new ethers.Contract(strategyAddr!, STRATEGY_ABI, owner) as unknown as InitStrategy;

  async function runStep(label: string, action: (nonce: number) => Promise<ContractTransactionResponse>): Promise<void> {
    console.log(`\n── ${label} ──`);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const nonce = await provider.getTransactionCount(owner.address, "pending");
        const tx = await action(nonce);
        await tx.wait();
        console.log("  ok");
        return;
      } catch (err: unknown) {
        const errObj = err as { code?: string; message?: string };
        if (errObj?.code === "NONCE_EXPIRED" || errObj?.message?.includes("nonce")) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
        console.log(`  ⚠ ${msg} (¿ya estaba configurado o inicializado?)`);
        return;
      }
    }
  }

  await runStep("TreasuryVault.init(usdc)", (nonce) => vault.init(usdcAddr!, { nonce }));

  await runStep("Strategy.init(...)", (nonce) =>
    target.isLocal
      ? strategy.init(usdcAddr!, { nonce })
      : strategy.init(AAVE_V3_POOL_SEPOLIA, USDC_SEPOLIA, AUSDC_SEPOLIA, { nonce }),
  );

  await runStep("Strategy.setVault(vault)", (nonce) => strategy.setVault(vaultAddr!, { nonce }));

  await runStep("TreasuryVault.setStrategy(strategy)", (nonce) => vault.setStrategy(strategyAddr!, { nonce }));

  await runStep("ChallengePool.init(vault, usdc, rate)", (nonce) => pool.init(vaultAddr!, usdcAddr!, rateBps, { nonce }));

  console.log("\nContratos inicializados y cableados");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\ninit falló:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
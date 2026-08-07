/**
 * Inicializa los contratos de OtterPot.
 *
 * En producción esta tarea la hace el Worker; este script la replica para
 * pruebas y para el bootstrap manual de un entorno:
 *   1. TreasuryVault.init(usdc)
 *   2. ChallengePool.init(vault, usdc, commissionBps)
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
 *       [--pool <addr>] [--rate <bps>]
 */

import { ethers } from "ethers";
import type { ContractTransactionResponse, Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { parseArgs, resolveTarget, getSigner } from "./otter";

const POOL_ABI = [
  "function init(address,address,uint256) returns (bool)",
] as const;

const VAULT_ABI = [
  "function init(address) returns (bool)",
] as const;

interface InitPool {
  connect(signer: Wallet): InitPool;
  init(vault: string, usdc: string, rate: bigint): Promise<ContractTransactionResponse>;
}
interface InitVault {
  connect(signer: Wallet): InitVault;
  init(usdc: string): Promise<ContractTransactionResponse>;
}

function resolveAddress(flag: string | undefined, envName: string, chainId: number, deployKey: string): string | undefined {
  if (flag) return flag;
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
  for (const [name, addr] of [
    ["USDC", usdcAddr],
    ["ChallengePool", poolAddr],
    ["TreasuryVault", vaultAddr],
  ] as const) {
    if (!addr) throw new Error(`Falta dirección de ${name}: pásala con --usdc/--pool/--vault, con su variable de entorno o despliega antes los contratos`);
  }

  const provider = new ethers.JsonRpcProvider(target.rpc);
  const owner = getSigner(target, "owner", provider);

  console.log(`Red: ${target.isLocal ? "local (Nitro DevNode)" : "testnet"}  chainId=${target.chainId}  rpc=${target.rpc}`);
  console.log(`owner: ${owner.address}`);
  console.log(`usdc=${usdcAddr}  vault=${vaultAddr}  pool=${poolAddr}  rateBps=${rateBps}`);

  const vault: InitVault = new ethers.Contract(vaultAddr!, VAULT_ABI, owner) as unknown as InitVault;
  const pool: InitPool = new ethers.Contract(poolAddr!, POOL_ABI, owner) as unknown as InitPool;

  console.log("\n── TreasuryVault.init(usdc) ──");
  await (await vault.init(usdcAddr!)).wait();
  console.log("  ok");

  console.log("\n── ChallengePool.init(vault, usdc, rate) ──");
  await (await pool.init(vaultAddr!, usdcAddr!, rateBps)).wait();
  console.log("  ok");

  console.log("\nContratos inicializados");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\ninit falló:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
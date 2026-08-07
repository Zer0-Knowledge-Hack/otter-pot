/**
 * Establece la estrategia activa en TreasuryVault.
 *
 * Uso:
 *   yarn workspace @ss/stylus set:strategy [--network local|sepolia]
 *       [--rpc <url>] [--chain-id <id>]
 *       [--vault <addr>] [--strategy <addr>]
 *
 * Lee la dirección del vault y la estrategia desde deployments/<chainId>_latest.json
 * si no se pasan por flags.
 */

import { ethers } from "ethers";
import type { ContractTransactionResponse, Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { parseArgs, resolveTarget, getSigner } from "./otter";

const VAULT_ABI = [
  "function setStrategy(address) returns (bool)",
  "function strategy() view returns (address)",
] as const;

interface VaultLike {
  connect(signer: Wallet): VaultLike;
  setStrategy(strategy: string): Promise<ContractTransactionResponse>;
  strategy(): Promise<string>;
}

function resolveAddress(
  flag: string | undefined,
  envName: string,
  chainId: number,
  deployKey: string,
): string | undefined {
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

  const vaultAddr = resolveAddress(args["vault"], "VAULT_ADDRESS", target.chainId, "treasury_vault");
  const strategyAddr = resolveAddress(args["strategy"], "STRATEGY_ADDRESS", target.chainId, "mock_strategy");

  if (!vaultAddr) throw new Error("Falta dirección del vault: pásala con --vault o despliega antes");
  if (!strategyAddr) throw new Error("Falta dirección de la estrategia: pásala con --strategy o despliega antes");

  const provider = new ethers.JsonRpcProvider(target.rpc);
  const owner = getSigner(target, "owner", provider);

  console.log(`Red: ${target.isLocal ? "local (Nitro DevNode)" : "testnet"}  chainId=${target.chainId}`);
  console.log(`owner: ${owner.address}`);
  console.log(`vault: ${vaultAddr}`);
  console.log(`strategy: ${strategyAddr}`);

  const vault: VaultLike = new ethers.Contract(vaultAddr, VAULT_ABI, owner) as unknown as VaultLike;

  const currentStrategy = await vault.strategy();
  console.log(`\nEstrategia actual: ${currentStrategy}`);
  if (currentStrategy.toLowerCase() === strategyAddr.toLowerCase()) {
    console.log("La estrategia ya está configurada, no se requiere cambio.");
    return;
  }

  console.log("\n── TreasuryVault.setStrategy(strategy) ──");
  const tx = await vault.setStrategy(strategyAddr);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("sin receipt");
  console.log(`  ✔ ok (tx ${receipt.hash})`);

  const newStrategy = await vault.strategy();
  console.log(`\nEstrategia configurada: ${newStrategy}`);
  if (newStrategy.toLowerCase() !== strategyAddr.toLowerCase()) {
    throw new Error("La estrategia no se actualizó correctamente");
  }
  console.log("✅ Estrategia actualizada correctamente");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n❌ set-strategy falló:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
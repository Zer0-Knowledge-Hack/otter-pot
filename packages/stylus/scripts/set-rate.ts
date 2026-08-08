/**
 * set-rate.ts — Operational script to update ChallengePool commission rate.
 *
 * Usage:
 *   npx ts-node scripts/set-rate.ts --rate <bps> [--pool <address>] [--network <local|sepolia>]
 *
 * Arguments:
 *   --rate <bps>    (required) New commission rate in basis points (200–500).
 *   --pool <addr>   (optional) ChallengePool address. Falls back to
 *                   deployments/<chainId>_latest.json → challenge_pool.address.
 *   --network       (optional) "local" (default) or "sepolia".
 *
 * The script:
 *   1. Reads the current rate via commissionRate() view.
 *   2. Calls setCommissionRate(newRateBps) from the owner wallet.
 *   3. Reads back the rate to confirm the change.
 *   4. Prints old → new in basis points and as a percentage.
 *
 * Security: never hard-codes private keys; they come from the devnode accounts
 * or the PRIVATE_KEY_SEPOLIA env var (via otter.ts getSigner). See AGENTS.md.
 */

import { ethers } from "ethers";
import type { ContractTransactionResponse, Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { parseArgs, resolveTarget, getSigner } from "./otter";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

// ─── ABI (only the functions this script needs) ──────────────────────────────

const POOL_ABI = [
  "function setCommissionRate(uint256 rateBps) returns (bool)",
  "function commissionRate() view returns (uint256)",
] as const;

// Typed interface for the subset of the pool we interact with.
interface PoolRateLike {
  connect(signer: Wallet): PoolRateLike;
  setCommissionRate(rateBps: bigint): Promise<ContractTransactionResponse>;
  commissionRate(): Promise<bigint>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolvePoolAddress(
  flagAddr: string | undefined,
  chainId: number
): string | undefined {
  if (flagAddr) return flagAddr;
  if (process.env["POOL_ADDRESS"]) return process.env["POOL_ADDRESS"];
  const file = path.resolve(
    __dirname,
    `../deployments/${chainId}_latest.json`
  );
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
        string,
        { address?: unknown }
      >;
      const entry = data["challenge_pool"];
      if (entry && typeof entry.address === "string") return entry.address;
    } catch {
      /* deployment file optional */
    }
  }
  return undefined;
}

function bpsToPercent(bps: bigint): string {
  const whole = bps / 100n;
  const frac = bps % 100n;
  return `${whole}.${frac.toString().padStart(2, "0")}%`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);

  // Validate --rate flag.
  const rateArg = args["rate"];
  if (!rateArg) {
    console.error(
      "❌ Missing --rate <bps>. Provide a value between 200 and 500."
    );
    process.exit(1);
  }
  const newRateBps = BigInt(rateArg);

  // Resolve pool address.
  const poolAddr = resolvePoolAddress(args["pool"], target.chainId);
  if (!poolAddr) {
    console.error(
      [
        "❌ No ChallengePool address found.",
        "Pass --pool <address>, set POOL_ADDRESS env var, or ensure",
        `deployments/${target.chainId}_latest.json exists with challenge_pool.address.`,
      ].join("\n")
    );
    process.exit(1);
  }

  console.log("============================================================");
  console.log("   OtterPot — set-rate: update ChallengePool commission");
  console.log(
    "   Network:",
    target.isLocal ? "local (Nitro DevNode)" : "testnet",
    " chainId:",
    target.chainId
  );
  console.log("   RPC:", target.rpc);
  console.log("   Pool:", poolAddr);
  console.log("============================================================\n");

  const provider = new ethers.JsonRpcProvider(target.rpc);
  const owner = getSigner(target, "owner", provider);
  const pool = new ethers.Contract(poolAddr, POOL_ABI, owner) as unknown as PoolRateLike;

  // Read current rate.
  const currentRate = await pool.commissionRate();
  console.log(
    `Current rate : ${currentRate} bps (${bpsToPercent(currentRate)})`
  );
  console.log(
    `Requested    : ${newRateBps} bps (${bpsToPercent(newRateBps)})\n`
  );

  if (currentRate === newRateBps) {
    console.log("✅ Rate is already set to the requested value. No-op.");
    return;
  }

  // Call setCommissionRate.
  console.log("Sending setCommissionRate transaction…");
  const tx = await pool.setCommissionRate(newRateBps);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction returned null receipt");
  console.log(`✔ Transaction confirmed: ${receipt.hash}`);

  // Confirm the change by reading back.
  const confirmedRate = await pool.commissionRate();
  if (confirmedRate !== newRateBps) {
    throw new Error(
      `Rate mismatch after tx: expected ${newRateBps}, got ${confirmedRate}`
    );
  }

  console.log("\n============================================================");
  console.log(
    `   ${currentRate} bps → ${confirmedRate} bps  (${bpsToPercent(currentRate)} → ${bpsToPercent(confirmedRate)})`
  );
  console.log("============================================================");
  console.log("✅ Commission rate updated successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n❌ set-rate failed:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

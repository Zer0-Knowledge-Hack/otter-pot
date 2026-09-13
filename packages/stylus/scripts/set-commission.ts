import { createWalletClient, createPublicClient, http, parseAbi, type WalletClient, type PublicClient, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const ADDRESSES_FILE = path.join(__dirname, "../../worker/contracts/AddressContracts.json");

interface ContractAddresses {
  treasury_vault: { address: string };
  challenge_pool: { address: string };
  aave_strategy: { address: string };
  aave_pool_v3: { address: string };
  usdc: { address: string };
  atoken: { address: string };
}

const challengePoolAbi = parseAbi([
  "function setCommissionRate(uint256 rate_bps)",
  "function commissionRate() view returns (uint256)",
]);

async function main() {
  console.log("🔧 Actualizando commission rate a 2% (200 bps)...\n");

  // Load contract addresses
  const addresses: ContractAddresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));

  // Get private key
  const privateKey = process.env["PRIVATE_KEY_SEPOLIA"];
  if (!privateKey) {
    throw new Error("PRIVATE_KEY_SEPOLIA no configurada en .env");
  }

  const account = privateKeyToAccount(`0x${privateKey}` as `0x${string}`);

  // Create wallet client (for writing)
  const walletClient: WalletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
  });

  // Create public client (for reading)
  const publicClient: PublicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
  });

  console.log(`📝 Usando cuenta: ${account.address}\n`);

  // Check current rate
  const currentRate = await publicClient.readContract({
    address: addresses.challenge_pool.address as Address,
    abi: challengePoolAbi,
    functionName: "commissionRate",
  });
  console.log(`   Commission rate actual: ${currentRate} bps (${Number(currentRate) / 100}%)`);

  // Set new rate to 200 bps (2%)
  console.log(`   Estableciendo a 200 bps (2%)...`);

  const hash = await walletClient.writeContract({
    address: addresses.challenge_pool.address as Address,
    abi: challengePoolAbi,
    functionName: "setCommissionRate",
    args: [200n],
    account,
    chain: arbitrumSepolia,
  });

  console.log(`   📤 Tx enviada: ${hash}`);
  console.log(`   ⏳ Esperando confirmación...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   ✅ Confirmado en bloque ${receipt.blockNumber}`);

  // Verify new rate
  const newRate = await publicClient.readContract({
    address: addresses.challenge_pool.address as Address,
    abi: challengePoolAbi,
    functionName: "commissionRate",
  });
  console.log(`   ✅ Nuevo commission rate: ${newRate} bps (${Number(newRate) / 100}%)`);

  console.log("\n✨ Commission rate actualizado");
}

main().catch(console.error);
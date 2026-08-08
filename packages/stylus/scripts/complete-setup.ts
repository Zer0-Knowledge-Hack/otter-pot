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
  "function setTreasuryVault(address new_vault)",
  "function commissionRate() view returns (uint256)",
]);

const aaveStrategyAbi = parseAbi([
  "function setVault(address vault)",
  "function vault() view returns (address)",
]);

const treasuryVaultAbi = parseAbi([
  "function strategy() view returns (address)",
  "function setStrategy(address strategy)",
]);

async function main() {
  console.log("🚀 Completando configuración de contratos en Arbitrum Sepolia...\n");

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

  // 1. Set ChallengePool treasuryVault
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 ChallengePool: Configurando treasuryVault...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const hash = await walletClient.writeContract({
      address: addresses.challenge_pool.address as Address,
      abi: challengePoolAbi,
      functionName: "setTreasuryVault",
      args: [addresses.treasury_vault.address as Address],
      account,
      chain: arbitrumSepolia,
    });
    console.log(`   📤 Tx enviada: ${hash}`);
    console.log(`   ⏳ Esperando confirmación...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   ✅ Confirmado en bloque ${receipt.blockNumber}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e}`);
  }

  // 2. Set AaveStrategy vault
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏦 AaveStrategy: Configurando vault...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const hash = await walletClient.writeContract({
      address: addresses.aave_strategy.address as Address,
      abi: aaveStrategyAbi,
      functionName: "setVault",
      args: [addresses.treasury_vault.address as Address],
      account,
      chain: arbitrumSepolia,
    });
    console.log(`   📤 Tx enviada: ${hash}`);
    console.log(`   ⏳ Esperando confirmación...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   ✅ Confirmado en bloque ${receipt.blockNumber}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e}`);
  }

  // 3. Verify TreasuryVault strategy (already correct)
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔗 TreasuryVault: Verificando strategy...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const strategy = await publicClient.readContract({
      address: addresses.treasury_vault.address as Address,
      abi: treasuryVaultAbi,
      functionName: "strategy",
    });
    console.log(`   Strategy actual: ${strategy}`);
    console.log(`   Strategy esperado: ${addresses.aave_strategy.address}`);
    console.log(`   ${strategy.toLowerCase() === addresses.aave_strategy.address.toLowerCase() ? "✅ Coincide" : "⚠️ NO coincide"}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e}`);
  }

  console.log("\n✨ Configuración completada");
  console.log("\n💡 Ejecuta 'yarn ts-node scripts/verify-contracts.ts' para verificar el estado final");
}

main().catch(console.error);
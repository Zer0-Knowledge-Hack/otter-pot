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
  "function init(address treasury_vault, address usdc, uint256 base_commission_rate)",
  "function commissionRate() view returns (uint256)",
]);

const aaveStrategyAbi = parseAbi([
  "function init(address pool, address usdc, address atoken)",
  "function vault() view returns (address)",
]);

const treasuryVaultAbi = parseAbi([
  "function strategy() view returns (address)",
  "function setStrategy(address strategy)",
]);

async function main() {
  console.log("🚀 Inicializando contratos en Arbitrum Sepolia...\n");

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

  // 1. Initialize ChallengePool
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 Inicializando ChallengePool...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    // Check current commission rate
    const currentRate = await publicClient.readContract({
      address: addresses.challenge_pool.address as Address,
      abi: challengePoolAbi,
      functionName: "commissionRate",
    });
    console.log(`   commissionRate actual: ${currentRate} bps`);

    console.log(`   Llamando init(treasury_vault=${addresses.treasury_vault.address}, usdc=${addresses.usdc.address}, base_commission_rate=300)`);

    const hash = await walletClient.writeContract({
      address: addresses.challenge_pool.address as Address,
      abi: challengePoolAbi,
      functionName: "init",
      args: [
        addresses.treasury_vault.address as Address,
        addresses.usdc.address as Address,
        300n, // 3% commission rate
      ],
      account,
      chain: arbitrumSepolia,
    });

    console.log(`   📤 Tx enviada: ${hash}`);
    console.log(`   ⏳ Esperando confirmación...`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   ✅ Confirmado en bloque ${receipt.blockNumber} (gas usado: ${receipt.gasUsed})`);
  } catch (e) {
    console.log(`   ❌ Error: ${e}`);
    if (e instanceof Error && e.message.includes("already initialized")) {
      console.log("   ℹ️ El contrato ya estaba inicializado");
    }
  }

  // 2. Initialize AaveStrategy
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏦 Inicializando AaveStrategy...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    console.log(`   Llamando init(pool=${addresses.aave_pool_v3.address}, usdc=${addresses.usdc.address}, atoken=${addresses.atoken.address})`);

    const hash = await walletClient.writeContract({
      address: addresses.aave_strategy.address as Address,
      abi: aaveStrategyAbi,
      functionName: "init",
      args: [
        addresses.aave_pool_v3.address as Address,
        addresses.usdc.address as Address,
        addresses.atoken.address as Address,
      ],
      account,
      chain: arbitrumSepolia,
    });

    console.log(`   📤 Tx enviada: ${hash}`);
    console.log(`   ⏳ Esperando confirmación...`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   ✅ Confirmado en bloque ${receipt.blockNumber} (gas usado: ${receipt.gasUsed})`);
  } catch (e) {
    console.log(`   ❌ Error: ${e}`);
    if (e instanceof Error && e.message.includes("already initialized")) {
      console.log("   ℹ️ El contrato ya estaba inicializado");
    }
  }

  // 3. Verify TreasuryVault has correct strategy set
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔗 Verificando TreasuryVault -> AaveStrategy...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const strategy = await publicClient.readContract({
      address: addresses.treasury_vault.address as Address,
      abi: treasuryVaultAbi,
      functionName: "strategy",
    });

    if (strategy.toLowerCase() === addresses.aave_strategy.address.toLowerCase()) {
      console.log(`   ✅ TreasuryVault ya tiene AaveStrategy configurada correctamente`);
    } else {
      console.log(`   ⚠️ Strategy actual: ${strategy}, esperada: ${addresses.aave_strategy.address}`);
      console.log(`   🔧 Configurando strategy correcta...`);

      const hash = await walletClient.writeContract({
        address: addresses.treasury_vault.address as Address,
        abi: treasuryVaultAbi,
        functionName: "setStrategy",
        args: [addresses.aave_strategy.address as Address],
        account,
        chain: arbitrumSepolia,
      });

      console.log(`   📤 Tx enviada: ${hash}`);
      console.log(`   ⏳ Esperando confirmación...`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`   ✅ Confirmado en bloque ${receipt.blockNumber}`);
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e}`);
  }

  console.log("\n✨ Inicialización completada");
  console.log("\n💡 Ejecuta 'yarn ts-node scripts/verify-contracts.ts' para verificar el estado final");
}

main().catch(console.error);
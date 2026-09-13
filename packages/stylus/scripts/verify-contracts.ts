import { createPublicClient, http, parseAbi, type PublicClient } from "viem";
import { arbitrumSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

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
  "function commissionRate() view returns (uint256)",
  "function treasuryVault() view returns (address)",
  "function usdc() view returns (address)",
]);

const treasuryVaultAbi = parseAbi([
  "function strategy() view returns (address)",
  "function usdc() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function strategyDeployed() view returns (uint256)",
]);

const aaveStrategyAbi = parseAbi([
  "function vault() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function balanceOf() view returns (uint256)",
]);

async function main() {
  console.log("🔍 Verificando contratos desplegados en Arbitrum Sepolia...\n");

  // Load contract addresses
  const addresses: ContractAddresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));

  // Create public client
  const client: PublicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
  });

  console.log("📡 Conectado a Arbitrum Sepolia\n");

  // Verify ChallengePool
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 ChallengePool: " + addresses.challenge_pool.address);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const commissionRate = await client.readContract({
      address: addresses.challenge_pool.address as `0x${string}`,
      abi: challengePoolAbi,
      functionName: "commissionRate",
    });
    console.log(`✅ commissionRate: ${commissionRate} bps (${Number(commissionRate) / 100}%)`);
  } catch (e) {
    console.log(`❌ Error leyendo commissionRate: ${e}`);
  }

  try {
    const treasuryVault = await client.readContract({
      address: addresses.challenge_pool.address as `0x${string}`,
      abi: challengePoolAbi,
      functionName: "treasuryVault",
    });
    console.log(`✅ treasuryVault: ${treasuryVault}`);
    console.log(`   ${treasuryVault.toLowerCase() === addresses.treasury_vault.address.toLowerCase() ? "✅ Coincide con TreasuryVault desplegado" : "⚠️ NO coincide con TreasuryVault desplegado"}`);
  } catch (e) {
    console.log(`❌ Error leyendo treasuryVault: ${e}`);
  }

  try {
    const usdc = await client.readContract({
      address: addresses.challenge_pool.address as `0x${string}`,
      abi: challengePoolAbi,
      functionName: "usdc",
    });
    console.log(`✅ usdc: ${usdc}`);
    console.log(`   ${usdc.toLowerCase() === addresses.usdc.address.toLowerCase() ? "✅ Coincide con USDC configurado" : "⚠️ NO coincide con USDC configurado"}`);
  } catch (e) {
    console.log(`❌ Error leyendo usdc: ${e}`);
  }

  // Verify TreasuryVault
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏦 TreasuryVault: " + addresses.treasury_vault.address);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const strategy = await client.readContract({
      address: addresses.treasury_vault.address as `0x${string}`,
      abi: treasuryVaultAbi,
      functionName: "strategy",
    });
    console.log(`✅ strategy: ${strategy}`);
    console.log(`   ${strategy.toLowerCase() === addresses.aave_strategy.address.toLowerCase() ? "✅ Coincide con AaveStrategy desplegada" : "⚠️ NO coincide con AaveStrategy desplegada"}`);
  } catch (e) {
    console.log(`❌ Error leyendo strategy: ${e}`);
  }

  try {
    const usdc = await client.readContract({
      address: addresses.treasury_vault.address as `0x${string}`,
      abi: treasuryVaultAbi,
      functionName: "usdc",
    });
    console.log(`✅ usdc: ${usdc}`);
    console.log(`   ${usdc.toLowerCase() === addresses.usdc.address.toLowerCase() ? "✅ Coincide con USDC configurado" : "⚠️ NO coincide con USDC configurado"}`);
  } catch (e) {
    console.log(`❌ Error leyendo usdc: ${e}`);
  }

  try {
    const totalAssets = await client.readContract({
      address: addresses.treasury_vault.address as `0x${string}`,
      abi: treasuryVaultAbi,
      functionName: "totalAssets",
    });
    console.log(`✅ totalAssets: ${totalAssets} (${Number(totalAssets) / 1e6} USDC)`);
  } catch (e) {
    console.log(`❌ Error leyendo totalAssets: ${e}`);
  }

  try {
    const totalShares = await client.readContract({
      address: addresses.treasury_vault.address as `0x${string}`,
      abi: treasuryVaultAbi,
      functionName: "totalShares",
    });
    console.log(`✅ totalShares: ${totalShares}`);
  } catch (e) {
    console.log(`❌ Error leyendo totalShares: ${e}`);
  }

  try {
    const pricePerShare = await client.readContract({
      address: addresses.treasury_vault.address as `0x${string}`,
      abi: treasuryVaultAbi,
      functionName: "pricePerShare",
    });
    console.log(`✅ pricePerShare: ${pricePerShare} (${Number(pricePerShare) / 1e18} USDC per share)`);
  } catch (e) {
    console.log(`❌ Error leyendo pricePerShare: ${e}`);
  }

  try {
    const strategyDeployed = await client.readContract({
      address: addresses.treasury_vault.address as `0x${string}`,
      abi: treasuryVaultAbi,
      functionName: "strategyDeployed",
    });
    console.log(`✅ strategyDeployed: ${strategyDeployed} (${Number(strategyDeployed) / 1e6} USDC)`);
  } catch (e) {
    console.log(`❌ Error leyendo strategyDeployed: ${e}`);
  }

  // Verify AaveStrategy
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏦 AaveStrategy: " + addresses.aave_strategy.address);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  try {
    const vault = await client.readContract({
      address: addresses.aave_strategy.address as `0x${string}`,
      abi: aaveStrategyAbi,
      functionName: "vault",
    });
    console.log(`✅ vault: ${vault}`);
    console.log(`   ${vault.toLowerCase() === addresses.treasury_vault.address.toLowerCase() ? "✅ Coincide con TreasuryVault desplegado" : "⚠️ NO coincide con TreasuryVault desplegado"}`);
  } catch (e) {
    console.log(`❌ Error leyendo vault: ${e}`);
  }

  try {
    const totalAssets = await client.readContract({
      address: addresses.aave_strategy.address as `0x${string}`,
      abi: aaveStrategyAbi,
      functionName: "totalAssets",
    });
    console.log(`✅ totalAssets: ${totalAssets} (${Number(totalAssets) / 1e6} USDC)`);
  } catch (e) {
    console.log(`❌ Error leyendo totalAssets: ${e}`);
  }

  try {
    const balanceOf = await client.readContract({
      address: addresses.aave_strategy.address as `0x${string}`,
      abi: aaveStrategyAbi,
      functionName: "balanceOf",
    });
    console.log(`✅ balanceOf: ${balanceOf} (${Number(balanceOf) / 1e6} USDC)`);
  } catch (e) {
    console.log(`❌ Error leyendo balanceOf: ${e}`);
  }

  console.log("\n✨ Verificación completada");
}

main().catch(console.error);
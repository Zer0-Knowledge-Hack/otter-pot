/**
 * Script para inicializar y configurar el AaveStrategy en Sepolia
 * Uso: npx ts-node scripts/init-strategy.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const STRATEGY_ABI = [
  "function init(address,address,address) returns (bool)",
  "function setVault(address) returns (bool)",
  "function vault() view returns (address)",
  "function owner() view returns (address)",
];

interface StrategyLike {
  owner(): Promise<string>;
  vault(): Promise<string>;
  init(pool: string, usdc: string, atoken: string): Promise<ethers.ContractTransactionResponse>;
  setVault(vault: string): Promise<ethers.ContractTransactionResponse>;
}

async function main() {
  const rpcUrl = process.env["RPC_URL_SEPOLIA"];
  const privateKey = process.env["PRIVATE_KEY_SEPOLIA"];
  
  if (!rpcUrl || !privateKey) {
    throw new Error("Faltan RPC_URL_SEPOLIA o PRIVATE_KEY_SEPOLIA en .env");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const owner = new ethers.Wallet(privateKey, provider);

  console.log("Owner:", owner.address);

  const strategy = new ethers.Contract(
    "0x5abb4b394198a8cb93cdc202cd67dc5618d9b5ff",
    STRATEGY_ABI,
    owner
  ) as unknown as StrategyLike;

  // Check current state
  try {
    const stratOwner = await strategy.owner();
    console.log("Strategy owner:", stratOwner);
  } catch (e) {
    console.log("Could not get owner:", e instanceof Error ? e.message : e);
  }

  try {
    const vault = await strategy.vault();
    console.log("Current vault:", vault);
  } catch (e) {
    console.log("Could not get vault:", e instanceof Error ? e.message : e);
  }

  // Try to initialize
  console.log("\nTrying to initialize strategy...");
  try {
    const tx = await strategy.init(
      "0xBfC91D59fAA134A4ED45f7B584cAf96D7792Eff",
      "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      "0x625E7708f30cA75bfd92586e17077590C60eb4cD"
    );
    await tx.wait();
    console.log("Init OK");
  } catch (e) {
    console.log("Init failed:", e instanceof Error ? e.message : e);
  }

  // Try to set vault
  console.log("\nTrying to set vault...");
  try {
    const tx = await strategy.setVault("0x88b3e03620eaec122e9a5946ceda72bbc91a8e46");
    await tx.wait();
    console.log("SetVault OK");
  } catch (e) {
    console.log("SetVault failed:", e instanceof Error ? e.message : e);
  }

  // Check vault again
  try {
    const vault = await strategy.vault();
    console.log("\nFinal vault:", vault);
  } catch (e) {
    console.log("Could not get vault:", e instanceof Error ? e.message : e);
  }
}

main().catch(console.error);
/**
 * Script para inicializar el AaveStrategy usando llamadas de bajo nivel
 * Uso: npx ts-node scripts/init-strategy-lowlevel.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
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

  const strategyAddr = "0x5abb4b394198a8cb93cdc202cd67dc5618d9b5ff";

  // Check if contract has code
  const code = await provider.getCode(strategyAddr);
  console.log("Contract code length:", code.length);
  if (code === "0x") {
    console.log("❌ Contract not deployed!");
    return;
  }

  // Try to call init using low-level call (bypass ethers ENS resolution)
  console.log("\nTrying to initialize strategy via low-level call...");
  
  // Encode the init function call
  const iface = new ethers.Interface([
    "function init(address,address,address) returns (bool)",
    "function setVault(address) returns (bool)",
    "function owner() view returns (address)",
    "function vault() view returns (address)"
  ]);
  
  // Use lowercase addresses to avoid checksum issues
  const poolAddr = "0xbfc91d59faa134a4ed45f7b584caf96d7792eff";
  const usdcAddr = "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d";
  const ausdcAddr = "0x625e7708f30ca75bfd92586e17077590c60eb4cd";
  const vaultAddr = "0x88b3e03620eaec122e9a5946ceda72bbc91a8e46";
  
  const initData = iface.encodeFunctionData("init", [poolAddr, usdcAddr, ausdcAddr]);
  
  console.log("Init calldata:", initData);
  
  try {
    const tx = await owner.sendTransaction({
      to: strategyAddr,
      data: initData,
      gasLimit: 500000,
    });
    console.log("Init tx sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Init OK, gas used:", receipt?.gasUsed?.toString());
  } catch (e) {
    console.log("Init failed:", e instanceof Error ? e.message : e);
  }

  // Check owner now
  try {
    const ownerData = "0x8da5cb5b"; // owner() selector
    const result = await provider.call({ to: strategyAddr, data: ownerData });
    console.log("\nOwner call result:", result);
    if (result && result !== "0x") {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address"], ethers.getBytes(result));
      console.log("Strategy owner:", decoded[0]);
    }
  } catch (e) {
    console.log("Could not get owner:", e instanceof Error ? e.message : e);
  }

  // Try to call setVault
  console.log("\nTrying to set vault via low-level call...");
  const setVaultData = iface.encodeFunctionData("setVault", [vaultAddr]);
  
  try {
    const tx = await owner.sendTransaction({
      to: strategyAddr,
      data: setVaultData,
      gasLimit: 500000,
    });
    console.log("SetVault tx sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("SetVault OK, gas used:", receipt?.gasUsed?.toString());
  } catch (e) {
    console.log("SetVault failed:", e instanceof Error ? e.message : e);
  }

  // Check vault
  try {
    const vaultData = "0xfbfa77cf"; // vault() selector
    const result = await provider.call({ to: strategyAddr, data: vaultData });
    console.log("\nVault call result:", result);
    if (result && result !== "0x") {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address"], ethers.getBytes(result));
      console.log("Strategy vault:", decoded[0]);
    }
  } catch (e) {
    console.log("Could not get vault:", e instanceof Error ? e.message : e);
  }
}

main().catch(console.error);
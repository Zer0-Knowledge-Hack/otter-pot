import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const ETHERSCAN_KEY = process.env["ETHERSCAN_KEY"];
const CHAIN_ID = "421614"; // Arbitrum Sepolia
const API_URL = "https://api.etherscan.io/v2/api";

interface EtherscanResponse {
  status: string;
  message: string;
  result: string;
}

interface ContractToVerify {
  name: string;
  address: string;
  contractName: string; // Cargo package name
  sourceUrl: string; // GitHub URL to contract directory
  compilerVersion: string;
}

const contracts: ContractToVerify[] = [
  {
    name: "TreasuryVault",
    address: "0xf2c6da41a90bde1c341b634ed1e114a8cb2be37a",
    contractName: "treasury_vault",
    sourceUrl: "https://github.com/Zer0-Knowledge-Hack/otter-pot/tree/master/packages/stylus/contracts/treasury_vault",
    compilerVersion: "stylus:0.10.7",
  },
  {
    name: "ChallengePool",
    address: "0x4de4b2b29014f48a9e13b0686974e5d9a4181dfc",
    contractName: "challenge_pool",
    sourceUrl: "https://github.com/Zer0-Knowledge-Hack/otter-pot/tree/master/packages/stylus/contracts/challenge_pool",
    compilerVersion: "stylus:0.10.7",
  },
  {
    name: "AaveStrategy",
    address: "0x1530cdfca91e250e272a815405a318ed10e4150c",
    contractName: "aave_strategy",
    sourceUrl: "https://github.com/Zer0-Knowledge-Hack/otter-pot/tree/master/packages/stylus/contracts/aave_strategy",
    compilerVersion: "stylus:0.10.7",
  },
];

async function submitVerification(contract: ContractToVerify): Promise<string | null> {
  console.log(`\n📤 Enviando verificación para ${contract.name} (${contract.address})...`);
  console.log(`   Source URL: ${contract.sourceUrl}`);

  const formData = new URLSearchParams();
  formData.append("module", "contract");
  formData.append("action", "verifysourcecode");
  formData.append("chainid", CHAIN_ID);
  formData.append("apikey", ETHERSCAN_KEY!);
  formData.append("codeformat", "stylus");
  formData.append("sourceCode", contract.sourceUrl); // GitHub URL to contract directory
  formData.append("contractaddress", contract.address);
  formData.append("contractname", contract.contractName); // Cargo package name
  formData.append("compilerversion", contract.compilerVersion);
  formData.append("licenseType", "3"); // MIT

  try {
    const response = await fetch(`${API_URL}?module=contract&action=verifysourcecode&chainid=${CHAIN_ID}&apikey=${ETHERSCAN_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const result = (await response.json()) as EtherscanResponse;
    console.log(`   Response:`, JSON.stringify(result, null, 2));

    if (result.status === "1" && result.result) {
      console.log(`   ✅ Verificación enviada. GUID: ${result.result}`);
      return result.result;
    } else {
      console.log(`   ❌ Error: ${result.message} - ${result.result}`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Error en request: ${error}`);
    return null;
  }
}

async function checkVerificationStatus(guid: string): Promise<void> {
  console.log(`\n⏳ Consultando estado de verificación (GUID: ${guid})...`);
  
  // For Etherscan v2, the check status might be different
  // Let's try the standard check endpoint
  const checkUrl = `${API_URL}?module=contract&action=checkverifystatus&chainid=${CHAIN_ID}&apikey=${ETHERSCAN_KEY}&guid=${guid}`;
  
  let attempts = 0;
  const maxAttempts = 20;
  
  while (attempts < maxAttempts) {
try {
       const response = await fetch(checkUrl);
const result = (await response.json()) as EtherscanResponse;
      console.log(`   Intento ${attempts + 1}: ${result.message} - ${result.result}`);
      
      if (result.status === "1") {
        console.log(`   ✅ Verificación exitosa!`);
        return;
      }
      
      if (result.message === "Fail - Unable to verify") {
        console.log(`   ❌ Verificación falló: ${result.result}`);
        return;
      }
    } catch (error) {
      console.log(`   ⚠ Error consultando: ${error}`);
    }
    
    attempts++;
    if (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 15000)); // Wait 15 seconds
    }
  }
  
  console.log(`   ⏱ Timeout esperando verificación`);
}

async function main() {
  console.log("🔍 Verificando contratos Stylus en Arbiscan (Etherscan API v2)...");
  console.log(`Chain ID: ${CHAIN_ID}`);
  console.log(`API Key: ${ETHERSCAN_KEY?.slice(0, 8)}...`);

  for (const contract of contracts) {
    const guid = await submitVerification(contract);
    if (guid) {
      await checkVerificationStatus(guid);
    }
  }

  console.log("\n✨ Proceso de verificación completado");
}

main().catch(console.error);
import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";
import { MIRRORS } from "./mirrors";

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
  sourceUrl: string; // GitHub URL to mirror repo (root tiene Cargo.toml)
  compilerVersion: string;
}

const ADDRESSES_FILE = path.resolve(__dirname, "../../worker/contracts/AddressContracts.json");

function loadAddresses(): Record<string, string> {
  if (!fs.existsSync(ADDRESSES_FILE)) {
    throw new Error(`No existe ${ADDRESSES_FILE}`);
  }
  const raw = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8")) as Record<
    string,
    { address?: string }
  >;
  const map: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val.address) map[key] = val.address;
  }
  return map;
}

const contractAddresses = loadAddresses();

const contracts: ContractToVerify[] = MIRRORS.map((m) => {
  const address = contractAddresses[m.contractName];
  if (!address) throw new Error(`Falta dirección de ${m.contractName} en ${ADDRESSES_FILE}`);
  return {
    name: m.name,
    address,
    contractName: m.contractName,
    sourceUrl: m.repoUrl,
    compilerVersion: m.compilerVersion,
  };
});

async function submitVerification(contract: ContractToVerify): Promise<string | null> {
  console.log(`\n📤 Enviando verificación para ${contract.name} (${contract.address})...`);
  console.log(`   Source URL: ${contract.sourceUrl}`);

  const formData = new URLSearchParams();
  formData.append("module", "contract");
  formData.append("action", "verifysourcecode");
  formData.append("chainid", CHAIN_ID);
  formData.append("apikey", ETHERSCAN_KEY!);
  formData.append("codeformat", "stylus");
  formData.append("sourceCode", contract.sourceUrl); // URL del repo espejo (raíz = Cargo.toml)
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
  const maxAttempts = 3;
  const waitMs = 10000;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(checkUrl);
      const result = (await response.json()) as EtherscanResponse;
      console.log(`   Intento ${attempts + 1}/${maxAttempts}: ${result.message} - ${result.result}`);

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
      await new Promise((r) => setTimeout(r, waitMs));
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
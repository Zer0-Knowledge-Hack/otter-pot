import * as path from "path";
import * as fs from "fs";
import { getContractDataFromDeployments } from './utils/deployment';
import { executeCommand, generateTsAbi } from './utils/';

const contractsToExport = [
  {
    name: "ChallengePool",
    folder: "challenge_pool",
    chainId: "412346",
  },
  {
    name: "TreasuryVault",
    folder: "treasury_vault",
    chainId: "412346",
  },
  {
    name: "ChallengePool",
    folder: "challenge_pool",
    chainId: "421614",
  },
  {
    name: "TreasuryVault",
    folder: "treasury_vault",
    chainId: "421614",
  },
  {
    name: "AaveStrategy",
    folder: "aave_strategy",
    chainId: "421614",
  },
  {
    name: "MockStrategy",
    folder: "mock_strategy",
    chainId: "412346",
  }
];

const deploymentDir = path.join(__dirname, "../deployments");
const WORKER_TARGET_DIR = path.join(__dirname, "../../worker/contracts");

async function main() {
  console.log("⚙️  Generando ABIs...");

  for (const contract of contractsToExport) {
    console.log(`\n📦 Buscando despliegue para ${contract.name} en red ${contract.chainId}...`);

    const deploymentData = getContractDataFromDeployments(deploymentDir, contract.folder, contract.chainId);

    if (!deploymentData) {
      console.error(`❌ No se encontró despliegue (dirección) para ${contract.folder} en la carpeta 'deployments'. Asegúrate de haberlo desplegado primero.`);
      continue;
    }

    const { address, chainId, txHash } = deploymentData;
    console.log(`📍 Encontrado ${contract.name} en la red ${chainId} con dirección: ${address}`);

    const contractPath = path.join(__dirname, "../contracts", contract.folder);
    const abiOutputFile = path.resolve(__dirname, `../deployments/${contract.folder}.json`);

    try {
      // Export ABI using cargo stylus and save to file using --output (through WSL with login shell to load cargo env)
      const exportCommand = `wsl bash -lc "cargo stylus export-abi --output='../../deployments/${contract.folder}.json' --json"`;
      await executeCommand(exportCommand, contractPath, `Exportando ABI de ${contract.name}`);

      if (fs.existsSync(abiOutputFile)) {
        console.log(`✅ ABI file generado exitosamente en: ${abiOutputFile}`);
        
        // Copiar el JSON crudo para el backend (worker)
        if (!fs.existsSync(WORKER_TARGET_DIR)) {
          fs.mkdirSync(WORKER_TARGET_DIR, { recursive: true });
        }
        let rawContent = fs.readFileSync(abiOutputFile, "utf8");
        // Stylus/solc stdout includes text headers like "======= <stdin>:Contract =======", so we extract just the JSON array []
        const startIndex = rawContent.indexOf('[');
        const endIndex = rawContent.lastIndexOf(']');
        if (startIndex !== -1 && endIndex !== -1) {
          rawContent = rawContent.substring(startIndex, endIndex + 1);
        }
        
        // Escribimos el rawContent limpio de vuelta para que generateTsAbi (que también lee el JSON) no falle
        fs.writeFileSync(abiOutputFile, rawContent);
        
        const abiJson = JSON.parse(rawContent);
        fs.writeFileSync(
          path.join(WORKER_TARGET_DIR, `${contract.name}.abi.json`),
          JSON.stringify(abiJson, null, 2)
        );
        console.log(`✅ ABI JSON copiado a worker/contracts/${contract.name}.abi.json`);

        // Generar el TypeScript ABI para el frontend (Next.js)
        await generateTsAbi(
          abiOutputFile,
          contract.name,
          address,
          txHash || "",
          chainId
        );
      } else {
        console.error(`❌ No se generó el archivo ABI en: ${abiOutputFile}`);
      }
    } catch (error) {
      console.error(`❌ Error exportando ABI para ${contract.name}:`, error);
    }
  }
  console.log("\n¡Listo! Direcciones dinámicas aplicadas. Ya puedes versionar estos archivos.");
}

main().catch(console.error);

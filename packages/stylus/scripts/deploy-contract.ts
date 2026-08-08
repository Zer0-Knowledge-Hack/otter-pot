/**
 * Despliegue individual de UN contrato de OtterPot:
 *
 *   yarn workspace @ss/stylus deploy:contract --name treasury_vault --network sepolia
 *   yarn workspace @ss/stylus deploy:contract --name challenge_pool --network sepolia
 *   yarn workspace @ss/stylus deploy:contract --name aave_strategy --network sepolia
 *
 * Hace:
 *   1. Deploy del contrato especificado vía cargo stylus en WSL
 *   2. Actualiza la dirección en deployments/<chainId>_latest.json
 *   3. NO inicializa ni cablea contratos (para eso está setup:contracts)
 *
 * Útil cuando:
 *   - Solo un contrato necesita redeploy (fix, actualización)
 *   - El owner tiene poco ETH (deploy individual cuesta menos gas)
 *   - Los otros contratos ya funcionan y no se quieren tocar
 */

import { ethers } from "ethers";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { parseArgs, resolveTarget } from "./otter";
import { getPrivateKey } from "./utils/network";
import { extractDeploymentInfo } from "./utils/contract";
import { arbitrumNitro } from "../../nextjs/utils/scaffold-stylus/supportedChains";

const LINUX_CONTRACTS = path
  .resolve(__dirname, "../contracts")
  .replace(/^([A-Za-z]):\\/, (_: string, d: string) => `/mnt/${d.toLowerCase()}/`)
  .replace(/\\/g, "/");

const TMP_WORKSPACE = "/tmp/otter-deploy";

const VALID_CONTRACTS = {
  local: ["mock_usdc", "mock_strategy", "treasury_vault", "challenge_pool"] as const,
  sepolia: ["treasury_vault", "challenge_pool", "aave_strategy"] as const,
};

type ContractName = "treasury_vault" | "challenge_pool" | "aave_strategy" | "mock_usdc" | "mock_strategy";

function runWsl(script: string): string {
  return execFileSync("wsl", ["bash", "-lc", script], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}

async function cargoDeploy(
  name: string,
  rpc: string,
  privateKey: string,
  maxFeeGwei: string,
): Promise<string> {
  console.log(`\n🚀 Desplegando ${name}…`);
  const script = [
    `rm -rf ${TMP_WORKSPACE}/work`,
    `mkdir -p ${TMP_WORKSPACE}/work`,
    `cp -r '${LINUX_CONTRACTS}' ${TMP_WORKSPACE}/work/`,
    `cd ${TMP_WORKSPACE}/work/contracts/${name}`,
    `cargo stylus deploy --endpoint '${rpc}' --private-key '${privateKey}' --no-verify --max-fee-per-gas-gwei=${maxFeeGwei}`,
  ].join(" && ");
  const out = runWsl(script);
  const info = extractDeploymentInfo(out);
  if (!info) {
    throw new Error(
      `No se pudo extraer la dirección de ${name}. Salida:\n${out.slice(-2000)}`,
    );
  }
  console.log(`  ✔ ${name} → ${info.address}`);
  return info.address;
}

async function updateDeploymentFile(chainId: number, contractName: string, address: string): Promise<void> {
  const deployDir = path.resolve(__dirname, "../deployments");
  const file = path.join(deployDir, `${chainId}_latest.json`);
  
  let existing: Record<string, { address: string }> = {};
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, { address: string }>;
    } catch {
      console.warn(`  ⚠ No se pudo parsear ${file}, se crea nuevo`);
    }
  }
  
  existing[contractName] = { address };
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  console.log(`\n💾 Dirección actualizada en ${file}`);
  console.log(`   ${contractName}: ${address}`);
}

export default async function deployContractScript(
  opts: { network?: string; net?: string; name?: string } = {},
): Promise<void> {
  const raw = parseArgs(process.argv.slice(2));
  const network = opts.network ?? opts.net ?? raw["network"] ?? raw["net"];
  const contractName = (opts.name ?? raw["name"] ?? "").toLowerCase() as ContractName;
  
  if (!contractName) {
    throw new Error("Falta --name <contrato>. Contratos válidos: treasury_vault, challenge_pool, aave_strategy, mock_usdc, mock_strategy");
  }
  
  const target = resolveTarget({ ...raw, ...(network ? { network } : {}) });
  const chainId = target.chainId;
  
  const validContracts = target.isLocal ? VALID_CONTRACTS.local : VALID_CONTRACTS.sepolia;
  if (!validContracts.some(c => c === contractName)) {
    throw new Error(
      `Contrato "${contractName}" no válido para ${target.isLocal ? "local" : "sepolia"}. ` +
      `Válidos: ${validContracts.join(", ")}`
    );
  }

  const privateKey =
    (target.isLocal
      ? (arbitrumNitro.accounts[0] as { privateKey?: string }).privateKey ?? ""
      : getPrivateKey("arbitrumSepolia")).trim() ?? "";
  
  if (!privateKey) throw new Error("Falta la clave privada para el deploy");
  const normalizedKey =
    (privateKey.startsWith("0x") || privateKey.startsWith("0X")
      ? privateKey
      : "0x" + privateKey).toLowerCase();

  if (!target.isLocal) {
    const derived = new ethers.Wallet(normalizedKey).address;
    const expected = process.env["ACCOUNT_ADDRESS_SEPOLIA"];
    if (expected && expected.toLowerCase() !== derived.toLowerCase()) {
      throw new Error(
        `La PRIVATE_KEY_SEPOLIA no corresponde a ACCOUNT_ADDRESS_SEPOLIA (derivada ${derived})`,
      );
    }
    const provider = new ethers.JsonRpcProvider(target.rpc);
    const balance = await provider.getBalance(derived);
    console.log(`   Owner: ${derived}  bal: ${ethers.formatEther(balance)} ETH`);
    if (balance < ethers.parseEther("0.01")) {
      console.warn(`  ⚠ Saldo bajo (${ethers.formatEther(balance)} ETH). Puede que no alcance para el deploy.`);
    }
  }

  const maxFeeGwei =
    raw["max-fee"] ?? process.env["OTT_DEPLOY_MAXFEE_GWEI"] ?? "1";

  console.log("==========================================================");
  console.log("   OtterPot — deploy individual");
  console.log(`   Red: ${target.isLocal ? "local (Nitro DevNode)" : "testnet"}  chainId=${chainId}`);
  console.log(`   RPC: ${target.rpc}`);
  console.log(`   Contrato: ${contractName}`);
  console.log("==========================================================");

  const address = await cargoDeploy(contractName, target.rpc, normalizedKey, maxFeeGwei);
  await updateDeploymentFile(chainId, contractName, address);

  console.log("\n==========================================================");
  console.log("   ✅ Deploy individual completado");
  console.log(`   ${contractName}: ${address}`);
  console.log("==========================================================");
  console.log("\n📋 Próximos pasos:");
  console.log("   1. Re-inicializa los contratos con el nuevo address:");
  console.log(`      yarn setup:contracts --network ${target.isLocal ? "local" : "sepolia"}`);
  console.log("   2. Si es testnet, verifica en Arbiscan:");
  console.log(`      https://sepolia.arbiscan.io/address/${address}`);
}

if (require.main === module) {
  deployContractScript()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("\n❌ Deploy falló:");
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
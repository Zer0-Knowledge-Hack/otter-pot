import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { parseArgs, resolveTarget, getSigner } from "./otter";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const POOL_ABI = [
  "function addOperator(address) returns (bool)",
  "function isOperator(address) view returns (bool)",
] as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const operator = args["operator"];
  const network = args["network"] ?? "sepolia";

  if (!operator) {
    throw new Error("Falta --operator <address>");
  }

  const target = resolveTarget({ network });
  const provider = new ethers.JsonRpcProvider(target.rpc);
  const owner = getSigner(target, "owner", provider);

  const deploymentsPath = path.resolve(__dirname, `../deployments/${target.chainId}_latest.json`);
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`No existe ${deploymentsPath}`);
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const poolAddr = deployments["challenge_pool"]?.address;

  if (!poolAddr) {
    throw new Error("No hay challenge_pool en deployments");
  }

  console.log(`Red: ${target.isLocal ? "local" : "sepolia"} chainId=${target.chainId}`);
  console.log(`Owner: ${owner.address}`);
  console.log(`ChallengePool: ${poolAddr}`);
  console.log(`Añadiendo operador: ${operator}`);

  const pool = new ethers.Contract(poolAddr, POOL_ABI, owner);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOp = await (pool as any).isOperator(operator);
  if (isOp) {
    console.log("Ya es operador");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = await (pool as any).addOperator(operator);
  console.log(`Tx: ${tx.hash}`);
  await tx.wait();
  console.log("Operador añadido");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
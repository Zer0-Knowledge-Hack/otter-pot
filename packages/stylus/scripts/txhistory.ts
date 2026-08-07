/**
 * OtterPot — Historial de transacciones vía Etherscan API V2 (Arbitrum Sepolia).
 *
 * Por defecto recorre, en orden, las direcciones de cada contrato desplegado
 * (challenge_pool y treasury_vault desde deployments/<chainId>_latest.json) y
 * muestra sus transacciones y transferencias de tokens USDC. También se puede
 * consultar una dirección concreta o un label (owner/alice/bob/charlie).
 *
 * Usa ETHERSCAN_KEY del .env. Respeta el límite de la API (3 llamadas/segundo).
 *
 * Uso:
 *   npm run txhistory                     # todos los contratos
 *   npm run txhistory -- --label owner    # una entidad
 *   npm run txhistory -- --address 0x… --limit 25
 */

import { ethers } from "ethers";
import type { TransactionDescription } from "ethers";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { getSigner, loadParticipants, parseArgs, resolveTarget } from "./otter";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const API_BASE = "https://api.etherscan.io/v2/api";
const EXPLORER = "https://sepolia.arbiscan.io";
const USDC_DECIMALS = 6;

// Fragmentos conocidos para decodificar el método de la transacción.
const KNOWN_ABI = [
  "function createChallenge(uint256,uint256,address[]) returns (uint256)",
  "function deposit(uint256) returns (bool)",
  "function confirmResult(uint256,address) returns (bool)",
  "function refund(uint256) returns (bool)",
  "function claimRefund(uint256) returns (bool)",
  "function addOperator(address) returns (bool)",
  "function removeOperator(address) returns (bool)",
  "function setCommissionRate(uint256) returns (bool)",
  "function init(address,address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "function mint(address,uint256) returns (bool)",
  "function redeemShares(uint256,address) returns (uint256)",
  "function realizeYield(uint256) returns (bool)",
  "function setStrategy(address) returns (bool)",
  "function setPaused(bool) returns (bool)",
] as const;

const iface = new ethers.Interface(KNOWN_ABI);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Permite como máximo N llamadas por ventana de tiempo (por defecto 5/s).
class RateLimiter {
  private count = 0;
  private windowStart = 0;
  constructor(private readonly max: number, private readonly intervalMs: number) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      if (now - this.windowStart >= this.intervalMs) {
        this.count = 0;
        this.windowStart = now;
      }
      if (this.count < this.max) {
        this.count += 1;
        return;
      }
      await sleep(this.intervalMs - (now - this.windowStart));
    }
  }
}

// Etherscan V2 (cuenta free) permite 3 llamadas por segundo.
const limiter = new RateLimiter(3, 1000);

async function scan(
  apiKey: string,
  chainId: number,
  module: string,
  action: string,
  params: Record<string, string>
): Promise<unknown> {
  await limiter.acquire();
  const qs = new URLSearchParams({
    chainid: String(chainId),
    module,
    action,
    apikey: apiKey,
    ...params,
  });
  const res = await fetch(`${API_BASE}?${qs}`);
  const json = (await res.json()) as { status?: string; message?: string; result?: unknown };
  if (json.status !== "1") {
    const msg = String(json.message ?? "");
    const noTx =
      /no transactions found|no records found|no matching/i.test(msg) ||
      /0 record/i.test(String(json.result ?? ""));
    if (noTx) return [];
    throw new Error(`Arbiscan: ${json.message} — ${String(json.result ?? "")}`);
  }
  return json.result;
}

interface RawTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  input: string;
  txreceipt_status: string;
}

interface RawTokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenDecimal: string;
  tokenSymbol: string;
}

function decodeMethod(input: string): string {
  if (!input || input === "0x") return "contract creation";
  try {
    const desc: TransactionDescription | null = iface.parseTransaction({ data: input });
    return desc ? desc.name : input.slice(0, 10);
  } catch {
    return input.slice(0, 10);
  }
}

function short(a: string, n = 8): string {
  return `${a.slice(0, n)}…${a.slice(-4)}`;
}

function ts(seconds: string): string {
  return new Date(Number(seconds) * 1000).toISOString().replace("T", " ").slice(0, 19);
}

async function showSection(
  apiKey: string,
  target: { chainId: number },
  name: string,
  address: string
): Promise<void> {
  const hr = "─".repeat(62);
  console.log(`\n${hr}`);
  console.log(`  ${name.padEnd(16)} ${address}`);
  console.log(`  ${EXPLORER}/address/${address}`);
  console.log(`${hr}`);

  const txs = (await scan(apiKey, target.chainId, "account", "txlist", {
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "50",
    sort: "desc",
  })) as RawTx[];

  console.log(`  Transacciones (${txs.length}):`);
  if (txs.length === 0) {
    console.log("    (sin transacciones regulares)");
  }
  txs.forEach((t, i) => {
    const eth = ethers.formatEther(BigInt(t.value || "0"));
    console.log(
      `    ${String(i + 1).padStart(2)}  ${ts(t.timeStamp)}  ${decodeMethod(t.input).padEnd(24)} ` +
        `ETH=${eth.padStart(8)}  ${t.txreceipt_status === "1" ? "ok" : "FAILED".padEnd(2)}  ` +
        `${short(t.hash, 4)}  ${EXPLORER}/tx/${t.hash}`,
    );
  });

  const tokens = (await scan(apiKey, target.chainId, "account", "tokentx", {
    address,
    page: "1",
    offset: "50",
    sort: "desc",
  })) as RawTokenTx[];

  console.log(`  Transferencias de tokens (${tokens.length}):`);
  if (tokens.length === 0) {
    console.log("    (sin transfers de tokens)");
  }
  tokens.forEach((t, i) => {
    const amount = (Number(t.value) / 10 ** Number(t.tokenDecimal || USDC_DECIMALS)).toFixed(2);
    const dirIn = t.from.toLowerCase() === address.toLowerCase() ? "→" : "←";
    console.log(
      `    ${String(i + 1).padStart(2)}  ${ts(t.timeStamp)}  ${dirIn} ` +
        `${(t.tokenSymbol || "TOKEN").padEnd(6)} ${amount.padStart(10)}  ` +
        `${short(t.from, 4)} ${dirIn} ${short(t.to, 4)}  ${EXPLORER}/tx/${t.hash}`,
    );
  });
  await sleep(150);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args["network"] && !args["net"] && !args["rpc"]) args["network"] = "sepolia";
  const target = resolveTarget(args);
  const apiKey = process.env["ETHERSCAN_KEY"];
  if (!apiKey) throw new Error("Falta ETHERSCAN_KEY en el entorno (.env)");

  const header = (msg: string) => console.log(`${"═".repeat(62)}\n  ${msg}\n${"═".repeat(62)}`);
  header(`OtterPot — Historial de transacciones · chain ${target.chainId}`);

  const deploymentFile = path.resolve(__dirname, `../deployments/${target.chainId}_latest.json`);

  // Entidades a mostrar.
  const entities: { name: string; address?: string | undefined }[] = [];

  const address = args["address"];
  const label = args["label"];
  if (address) {
    entities.push({ name: label ?? "address", address });
  } else if (label) {
    if (label === "owner") {
      entities.push({
        name: "owner",
        address: getSigner(target, "owner", new ethers.JsonRpcProvider(target.rpc)).address,
      });
    } else {
      const rec = loadParticipants(target.chainId);
      const p = rec?.[label];
      entities.push({
        name: label,
        address: p?.address,
      });
    }
  } else {
    // Rastreo cada contrato desplegado.
    let rec: Record<string, { address?: string }> = {};
    if (fs.existsSync(deploymentFile)) {
      rec = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    }
    for (const [key, display] of [
      ["challenge_pool", "ChallengePool"],
      ["treasury_vault", "TreasuryVault"],
    ] as const) {
      if (rec[key]?.address) entities.push({ name: display, address: rec[key].address });
    }
    if (entities.length === 0) {
      throw new Error(
        "No hay contratos desplegados. Usa --address <0x…> o --label <owner|alice|bob|charlie>.",
      );
    }
  }

  const missing = entities.find((e) => !e.address);
  if (missing) throw new Error(`No se pudo resolver la dirección de "${missing.name}"`);

  for (const e of entities) {
    await showSection(apiKey, target, e.name, e.address as string);
  }

  console.log(`\n${"═".repeat(62)}`);
  console.log(`  Fin del historial · ${entities.length} entidad(es)· limit: 3 call/s respetado`);
  console.log(`${"═".repeat(62)}\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
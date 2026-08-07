/**
 * OtterPot: helpers compartidos para resolver el objetivo (red local o testnet)
 * y las cuentas firmantes desde los scripts `setup-contracts` e `integration-test-usdc`.
 *
 * Objetivo:
 *   - local  : Nuxtilo DevNode (chain 412346, http://127.0.0.1:8547). Las cuentas
 *             salen de arbitrumNitro.accounts (devnode). Es el default.
 *   - sepolia: Arbitrum Sepolia. Las cuentas salen del entorno (`PRIVATE_KEY_SEPOLIA`
 *             y `PARTICIPANT_KEY_*`), porque ahí no hay cuentas de dev financiadas.
 *
 * Selección (por orden):
 *   --rpc <url> [- chain-id <id>]  : red custom (cadena id infiere de --chain-id o 412346)
 *   --network <local|sepolia>      : alias de red conocido
 *   (default)                      : devnode local
 */

import { ethers } from "ethers";
import type { JsonRpcProvider, Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { arbitrumNitro } from "../../nextjs/utils/scaffold-stylus/supportedChains";
import { arbitrumSepolia } from "viem/chains";

export const LOCAL_CHAIN_ID = arbitrumNitro.id;
export const RPC_LOCAL_DEFAULT = "http://127.0.0.1:8547";

// Índice de las cuentas financiadas por nitro-devnode (ver supportedChains.ts).
const DEV_ACCOUNT_INDEX: Record<string, number> = {
  owner: 0,
  alice: 1,
  bob: 2,
  charlie: 3,
};

// Variable de entorno que provee la clave privada de cada actor en testnet.
const TESTNET_SIGNER_ENV: Record<string, string> = {
  owner: "PRIVATE_KEY_SEPOLIA",
  alice: "PARTICIPANT_KEY_ALICE",
  bob: "PARTICIPANT_KEY_BOB",
  charlie: "PARTICIPANT_KEY_CHARLIE",
};

export interface OtterTarget {
  chainId: number;
  rpc: string;
  isLocal: boolean;
}

export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i] as string;
    const next = argv[i + 1];
    if (current.startsWith("--") && next !== undefined && !next.startsWith("--")) {
      args[current.slice(2)] = next;
      i++;
    } else if (current.startsWith("--")) {
      args[current.slice(2)] = "true";
    }
  }
  return args;
}

export function resolveTarget(args: Record<string, string>): OtterTarget {
  const rpcFlag = args["rpc"];
  const net = (args["network"] ?? args["net"] ?? "local").toLowerCase();

  if (rpcFlag) {
    const chainId = Number(args["chain-id"]) || LOCAL_CHAIN_ID;
    return { chainId, rpc: rpcFlag, isLocal: chainId === LOCAL_CHAIN_ID };
  }

  if (
    net === "sepolia" ||
    net === "arbitrumsepolia" ||
    net === "arbitrum-sepolia"
  ) {
    const rpc =
      process.env["RPC_URL_SEPOLIA"] ||
      (arbitrumSepolia.rpcUrls.default.http[0] as string);
    return { chainId: arbitrumSepolia.id, rpc, isLocal: false };
  }

  if (net === "devnet" || net === "arbitrumnitro" || net === "nitro") {
    return { chainId: LOCAL_CHAIN_ID, rpc: RPC_LOCAL_DEFAULT, isLocal: true };
  }

  return { chainId: LOCAL_CHAIN_ID, rpc: RPC_LOCAL_DEFAULT, isLocal: true };
}

export interface ParticipantRecord {
  address: string;
  privateKey: string;
}

export function participantsFilePath(chainId: number): string {
  return path.resolve(__dirname, `../deployments/${chainId}_participants.json`);
}

export function loadParticipants(
  chainId: number
): Record<string, ParticipantRecord> | undefined {
  const file = participantsFilePath(chainId);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      ParticipantRecord
    >;
  } catch {
    return undefined;
  }
}

const PARTICIPANT_LABELS = ["alice", "bob", "charlie"];

export function getSigner(target: OtterTarget, label: string, provider: JsonRpcProvider): Wallet {
  if (target.isLocal) {
    const holder = arbitrumNitro.accounts[
      DEV_ACCOUNT_INDEX[label] as number
    ] as { privateKey?: string } | undefined;
    if (!holder?.privateKey) throw new Error(`Falta la cuenta "${label}" en arbitrumNitro.accounts`);
    return new ethers.Wallet(holder.privateKey, provider);
  }
  if (label.startsWith("participant") || PARTICIPANT_LABELS.indexOf(label) >= 0) {
    const rec = loadParticipants(target.chainId);
    const entry: ParticipantRecord | undefined = rec?.[label];
    if (entry?.privateKey) return new ethers.Wallet(entry.privateKey, provider);
  }
  const envName = TESTNET_SIGNER_ENV[label];
  if (!envName) throw new Error(`Actor "${label}" no mapeado a una variable de entorno en testnet`);
  const key = process.env[envName];
  if (!key) {
    throw new Error(`En testnet falta la clave privada para "${label}": define la variable de entorno ${envName}`);
  }
  return new ethers.Wallet(key, provider);
}
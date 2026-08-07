/**
 * Puente entre el bot y el `ChallengePool`.
 *
 * Separado del router a propósito: acá vive todo lo que toca la red y la clave
 * operadora, y nada de la lógica de Telegram. Mismo criterio de `confirmTx.ts`.
 *
 * ⚠️ `createChallenge` es permissionless en el contrato, pero la tx igual la firma
 * la cuenta operadora del worker porque alguien tiene que pagar el gas. El creador
 * queda registrado como `msg::sender()`, es decir el operador — no el usuario de
 * Telegram. No afecta la seguridad (el contrato no le da privilegios al creador),
 * pero conviene saberlo al leer `challenge.creator` en el explorador.
 */

import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Chain, Hex, PublicClient } from "viem";

export const CHALLENGE_POOL_ABI = parseAbi([
  "function createChallenge(uint256 requiredDeposit, uint256 deadline, address[] participants) returns (uint256)",
  "function challengeStatus(uint256 challengeId) view returns (uint8)",
  "function confirmResult(uint256 challengeId, address winner)",
  "function refund(uint256 challengeId)",
  "function isOperator(address operator) view returns (bool)",
  "event ChallengeCreated(uint256 indexed challengeId, address indexed creator, uint256 requiredDeposit, uint256 deadline)",
] as const);

/** Estados del reto, en el mismo orden que `logic.rs`. */
export const ESTADOS = ["Abierto", "Bloqueado", "Resuelto", "Reembolsado"] as const;
export type EstadoReto = (typeof ESTADOS)[number];

export function describirEstado(status: number): EstadoReto | "Desconocido" {
  return ESTADOS[status] ?? "Desconocido";
}

/** Nitro DevNode local. El id sale de `nitro-devnode/start-chain-with-cors.sh`. */
export const arbitrumNitroLocal: Chain = defineChain({
  id: 412346,
  name: "Arbitrum Nitro (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8547"] } },
});

export interface ChainConfig {
  rpcUrl: string;
  poolAddress: Address;
  operatorPrivateKey: Hex;
  chain?: Chain;
}

const PRIVATE_KEY_FORMAT = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_FORMAT = /^0x[0-9a-fA-F]{40}$/;

export interface ChainEnv {
  CHAIN_RPC_URL?: string;
  CHALLENGE_POOL_ADDRESS?: string;
  OPERATOR_PRIVATE_KEY?: string;
}

/**
 * Arma la configuración desde el entorno. Falla con un mensaje concreto por cada
 * variable que falte: un error de configuración tiene que ser obvio, no un
 * `undefined` que reviente tres capas más abajo.
 */
export function configDesdeEnv(env: ChainEnv, chain: Chain = arbitrumNitroLocal): ChainConfig {
  const { CHAIN_RPC_URL, CHALLENGE_POOL_ADDRESS, OPERATOR_PRIVATE_KEY } = env;

  if (!CHAIN_RPC_URL) throw new Error("cadena: falta CHAIN_RPC_URL");
  if (!CHALLENGE_POOL_ADDRESS) throw new Error("cadena: falta CHALLENGE_POOL_ADDRESS");
  if (!ADDRESS_FORMAT.test(CHALLENGE_POOL_ADDRESS)) {
    throw new Error("cadena: CHALLENGE_POOL_ADDRESS no es una dirección de 20 bytes");
  }
  if (!OPERATOR_PRIVATE_KEY) throw new Error("cadena: falta OPERATOR_PRIVATE_KEY");
  if (!PRIVATE_KEY_FORMAT.test(OPERATOR_PRIVATE_KEY)) {
    throw new Error("cadena: OPERATOR_PRIVATE_KEY con formato inválido (se espera 0x + 64 hex)");
  }

  return {
    rpcUrl: CHAIN_RPC_URL,
    poolAddress: CHALLENGE_POOL_ADDRESS as Address,
    operatorPrivateKey: OPERATOR_PRIVATE_KEY as Hex,
    chain,
  };
}

/**
 * Interfaz mínima de lo que el router necesita de la cadena, para poder
 * inyectar un doble en tests sin red ni claves (regla de `AGENTS.md`: sin `any`).
 */
export interface ChainClient {
  crearReto(deposito: bigint, deadline: bigint, participantes: Address[]): Promise<{ challengeId: bigint; txHash: Hex }>;
  estadoDeReto(challengeId: bigint): Promise<number>;
  reembolsar(challengeId: bigint): Promise<Hex>;
}

export function crearChainClient(config: ChainConfig): ChainClient {
  const chain = config.chain ?? arbitrumNitroLocal;
  const account = privateKeyToAccount(config.operatorPrivateKey);
  const transport = http(config.rpcUrl);

  const publicClient: PublicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  return {
    async crearReto(deposito, deadline, participantes) {
      const hash = await walletClient.writeContract({
        address: config.poolAddress,
        abi: CHALLENGE_POOL_ABI,
        functionName: "createChallenge",
        args: [deposito, deadline, participantes],
        account,
        chain,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // El id sale del evento: una escritura no devuelve su valor de retorno al
      // llamador externo, así que el `U256` que retorna el Rust no se puede leer.
      const logs = await publicClient.getContractEvents({
        address: config.poolAddress,
        abi: CHALLENGE_POOL_ABI,
        eventName: "ChallengeCreated",
        blockHash: receipt.blockHash,
      });

      const propio = logs.find((l) => l.transactionHash === hash);
      const challengeId = propio?.args.challengeId;
      if (challengeId === undefined) {
        throw new Error("cadena: el reto se creó pero no pude leer su id del evento ChallengeCreated");
      }

      return { challengeId, txHash: hash };
    },

    async estadoDeReto(challengeId) {
      const status = await publicClient.readContract({
        address: config.poolAddress,
        abi: CHALLENGE_POOL_ABI,
        functionName: "challengeStatus",
        args: [challengeId],
      });
      return Number(status);
    },

    async reembolsar(challengeId) {
      return walletClient.writeContract({
        address: config.poolAddress,
        abi: CHALLENGE_POOL_ABI,
        functionName: "refund",
        args: [challengeId],
        account,
        chain,
      });
    },
  };
}

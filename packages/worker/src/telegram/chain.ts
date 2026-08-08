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
import { arbitrumSepolia } from "viem/chains";
import type { ConfirmResultWriter } from "../confirmTx";

const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)"] as const);

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
  /** Token del pozo. Se necesita para leer sus decimales al escalar montos. */
  usdcAddress: Address;
  operatorPrivateKey: Hex;
  /** Obligatoria: sin esto, un default silencioso firma con la cadena equivocada. */
  chain: Chain;
}

const PRIVATE_KEY_FORMAT = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_FORMAT = /^0x[0-9a-fA-F]{40}$/;

export interface ChainEnv {
  CHAIN_RPC_URL?: string;
  CHALLENGE_POOL_ADDRESS?: string;
  USDC_ADDRESS?: string;
  OPERATOR_PRIVATE_KEY?: string;
  /** Id de la cadena. Debe coincidir con la del RPC o la firma se rechaza. */
  CHAIN_ID?: string;
}

/**
 * Resuelve la cadena a partir de su id.
 *
 * No es cosmético: viem firma la transacción con el chainId de esta definición, y
 * si no coincide con el del RPC el nodo la rechaza con «invalid chain id for
 * signer». Antes había un default silencioso a la cadena local, que funcionaba en
 * el devnode y fallaba al apuntar a Sepolia — justo al mover la demo a testnet.
 */
export function resolverCadena(chainId: number | undefined): Chain {
  if (chainId === arbitrumSepolia.id) return arbitrumSepolia;
  if (chainId === arbitrumNitroLocal.id) return arbitrumNitroLocal;
  throw new Error(
    `cadena: CHAIN_ID ${chainId ?? "(ausente)"} no reconocido. Usá ${arbitrumNitroLocal.id} (local) o ${arbitrumSepolia.id} (Arbitrum Sepolia).`,
  );
}

/**
 * Arma la configuración desde el entorno. Falla con un mensaje concreto por cada
 * variable que falte: un error de configuración tiene que ser obvio, no un
 * `undefined` que reviente tres capas más abajo.
 */
export function configDesdeEnv(env: ChainEnv, chainOverride?: Chain): ChainConfig {
  const { CHAIN_RPC_URL, CHALLENGE_POOL_ADDRESS, USDC_ADDRESS, OPERATOR_PRIVATE_KEY, CHAIN_ID } = env;
  const chain = chainOverride ?? resolverCadena(CHAIN_ID ? Number(CHAIN_ID) : undefined);

  if (!CHAIN_RPC_URL) throw new Error("cadena: falta CHAIN_RPC_URL");
  if (!CHALLENGE_POOL_ADDRESS) throw new Error("cadena: falta CHALLENGE_POOL_ADDRESS");
  if (!ADDRESS_FORMAT.test(CHALLENGE_POOL_ADDRESS)) {
    throw new Error("cadena: CHALLENGE_POOL_ADDRESS no es una dirección de 20 bytes");
  }
  if (!USDC_ADDRESS) throw new Error("cadena: falta USDC_ADDRESS");
  if (!ADDRESS_FORMAT.test(USDC_ADDRESS)) {
    throw new Error("cadena: USDC_ADDRESS no es una dirección de 20 bytes");
  }
  if (!OPERATOR_PRIVATE_KEY) throw new Error("cadena: falta OPERATOR_PRIVATE_KEY");
  if (!PRIVATE_KEY_FORMAT.test(OPERATOR_PRIVATE_KEY)) {
    throw new Error("cadena: OPERATOR_PRIVATE_KEY con formato inválido (se espera 0x + 64 hex)");
  }

  return {
    rpcUrl: CHAIN_RPC_URL,
    poolAddress: CHALLENGE_POOL_ADDRESS as Address,
    usdcAddress: USDC_ADDRESS as Address,
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
  /**
   * Convierte un monto humano («25») a las unidades crudas del token.
   *
   * Imprescindible: el USDC de Circle tiene 6 decimales y el `mock_usdc` local
   * tiene 0. Pasar el número sin escalar creaba retos de 0.000025 USDC contra el
   * USDC real, y el depósito fallaba con `incorrect_deposit_amount` porque la
   * Mini App sí escalaba. Los decimales se leen del token, nunca se asumen.
   */
  escalarUsdc(monto: number): Promise<bigint>;
  /**
   * Dirección del pool y emisor firmado, expuestos para que el flujo de
   * confirmación reuse `buildAndSendConfirmResult` de `confirmTx.ts` — que ya
   * tiene la guarda que impide enviar un ganador distinto al del consenso.
   * Duplicar esa validación acá sería crear una segunda fuente de verdad.
   */
  readonly poolAddress: Address;
  readonly writer: ConfirmResultWriter;
}

export function crearChainClient(config: ChainConfig): ChainClient {
  const chain = config.chain;
  const account = privateKeyToAccount(config.operatorPrivateKey);
  const transport = http(config.rpcUrl);

  const publicClient: PublicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  // Los decimales del token no cambian nunca, así que se leen una sola vez.
  let decimalesCache: number | null = null;

  return {
    poolAddress: config.poolAddress,

    async escalarUsdc(monto) {
      if (decimalesCache === null) {
        // La dirección viene por configuración: el `ChallengePool` del equipo no
        // expone un getter `usdc()`, así que no se puede deducir del contrato.
        decimalesCache = Number(
          await publicClient.readContract({
            address: config.usdcAddress,
            abi: ERC20_ABI,
            functionName: "decimals",
          }),
        );
      }
      return BigInt(monto) * 10n ** BigInt(decimalesCache);
    },

    // El writer que consume `confirmTx.ts`: recibe una llamada YA validada.
    writer: {
      async writeContract(call) {
        return walletClient.writeContract({
          address: call.address,
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
          account,
          chain,
        });
      },
    },

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

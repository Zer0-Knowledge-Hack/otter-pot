/**
 * Constructor y emisor de `confirmResult` — W3.1 (docs/backend-plan.md, Fase 3).
 *
 * Este es EL módulo sensible del worker: es el único que puede mover fondos del pozo
 * hacia una dirección. Por eso está partido en dos capas que no se mezclan:
 *
 *   1. `buildConfirmResultCall` — pura, sin red, sin claves. Lee el estado de consenso
 *      real (`getChallengeStatus`) y solo devuelve los parámetros de la llamada si el
 *      `expectedWinner` que pasó el caller coincide EXACTAMENTE con el ganador que
 *      calculó el consenso propio. Si no coincide (o si el consenso no se alcanzó, o si
 *      el reto no tiene confirmaciones), lanza ANTES de construir nada — nunca devuelve
 *      un objeto parcial que alguien pueda terminar de armar y firmar por accidente.
 *      Criterio de seguridad más importante del proyecto (SDD §11, plan Fase 3).
 *
 *   2. `sendConfirmResult` / `createOperatorWriter` — envío real firmado con la cuenta
 *      operadora. Toma los parámetros YA validados por la capa 1 y los manda a la cadena.
 *
 * ⚠️ Estado real (2026-08-07): la capa 2 NO está probada end-to-end contra una red.
 * No hay `ChallengePool` desplegado en ninguna red todavía, no hay clave operadora, y el
 * contrato tiene un bug crítico abierto (`confirm_result` no valida que `winner` sea
 * participante del reto — ver docs/backend-plan.md, Fase 3). Nuestra mitad (nunca enviar
 * un ganador distinto al que calculó el consenso) es correcta y necesaria, pero NO es
 * suficiente sola: el límite de confianza real es el contrato, y hoy está abierto.
 * No usar contra fondos reales hasta que Moises confirme el fix.
 */

import { createWalletClient, getAddress, http, isAddress, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import type { Abi, Address, Chain, Hex } from "viem";
import { getChallengeStatus } from "./confirmations";
import type { ChallengeId, ConfirmationStore } from "./confirmations";
import challengePoolFunctionsAbi from "../contracts/ChallengePool.abi.json";

/**
 * ABI de `ChallengePool` — desde 2026-08-07 se importa el archivo real que exporta el
 * pipeline de deploy de Moises (`packages/worker/contracts/ChallengePool.abi.json`,
 * generado por `packages/stylus/scripts/export_abi.ts`) en vez de mantener una copia
 * escrita a mano. Reduce el riesgo de que se desincronice con el contrato real.
 *
 * Ese archivo solo trae funciones, no eventos — `ChallengeResolved` se agrega acá,
 * verificado contra `challenge_pool/IChallengePool.sol` (sección de eventos).
 *
 * ⚠️ Los scripts TS del repo (`integration-test-usdc.ts:52`) declaran
 * `confirmResult(...) returns (bool)` — es incorrecto, el Rust retorna `()`. El JSON
 * importado ya lo tiene bien (`outputs: []`), no hay que corregir nada acá.
 * El depósito es en USDC (ERC-20), no ETH nativo: ninguna tx del worker hacia este contrato
 * lleva `value`.
 */
const CHALLENGE_RESOLVED_EVENT = parseAbiItem(
  "event ChallengeResolved(uint256 indexed challengeId, address indexed winner, uint256 totalPayout, uint256 commission)",
);

export const CHALLENGE_POOL_ABI = [
  ...(challengePoolFunctionsAbi as Abi),
  CHALLENGE_RESOLVED_EVENT,
] as const satisfies Abi;

/** Selector esperado de `confirmResult(uint256,address)` — verificado en el plan y en los tests. */
export const CONFIRM_RESULT_SELECTOR = "0x9c338d6b";

/** Parámetros exactos de la llamada, ya validados. Solo se construye si TODAS las guardas pasan. */
export interface ConfirmResultCall {
  address: Address;
  abi: typeof CHALLENGE_POOL_ABI;
  functionName: "confirmResult";
  args: readonly [bigint, Address];
}

export interface BuildConfirmResultCallParams {
  store: ConfirmationStore;
  challengeId: ChallengeId;
  /** Ganador que el caller CREE que ganó. Se contrasta contra el consenso real; no se confía en él. */
  expectedWinner: string;
  /** Dirección del `ChallengePool` desplegado. Pendiente de deploy — ver docs/backend-plan.md. */
  contractAddress: string;
}

const UINT256_MAX = (1n << 256n) - 1n;
const DECIMAL_ONLY = /^[0-9]+$/;

/** Compara direcciones hex sin depender del checksum — son case-insensitive por definición. */
const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Normaliza una dirección validando primero la forma hex. `strict: false` a propósito:
 * aceptamos cualquier casing de entrada (una dirección en minúsculas es válida y común),
 * pero rechazamos cualquier cosa que no sea una dirección de 20 bytes.
 */
function requireAddress(value: string, label: string): Address {
  if (!isAddress(value, { strict: false })) {
    throw new Error(`confirmResult: ${label} no es una dirección válida de 20 bytes: "${value}"`);
  }
  return getAddress(value);
}

function requireChallengeIdAsUint256(challengeId: ChallengeId): bigint {
  if (!DECIMAL_ONLY.test(challengeId)) {
    throw new Error(`confirmResult: challengeId "${challengeId}" no es un entero decimal sin signo`);
  }
  const asBigInt = BigInt(challengeId);
  if (asBigInt > UINT256_MAX) {
    throw new Error(`confirmResult: challengeId "${challengeId}" excede uint256`);
  }
  return asBigInt;
}

/**
 * CAPA PURA — sin red, sin claves, sin efectos. 100% testeable.
 *
 * Devuelve los parámetros de `confirmResult(uint256,address)` SOLO si el consenso ya se
 * alcanzó y su ganador coincide exactamente con `expectedWinner`. En cualquier otro caso
 * lanza antes de construir el objeto de llamada.
 */
export async function buildConfirmResultCall(
  params: BuildConfirmResultCallParams,
): Promise<ConfirmResultCall> {
  const { store, challengeId, expectedWinner, contractAddress } = params;

  const target = requireAddress(contractAddress, "contractAddress");
  const expected = requireAddress(expectedWinner, "expectedWinner");
  const challengeIdAsUint256 = requireChallengeIdAsUint256(challengeId);

  const status = await getChallengeStatus(store, challengeId);

  // Reto sin ninguna confirmación registrada: `threshold` sigue en null porque nunca se fijó.
  if (status.threshold === null) {
    throw new Error(
      `confirmResult: el reto "${challengeId}" no tiene ninguna confirmación registrada — no hay consenso que confirmar`,
    );
  }

  if (!status.consensusReached) {
    throw new Error(
      `confirmResult: el consenso del reto "${challengeId}" todavía no se alcanzó ` +
        `(${status.confirmationsCount}/${status.threshold} confirmaciones) — no se construye ninguna llamada`,
    );
  }

  // `winner` es opcional en el tipo: no se asume que exista solo porque consensusReached sea true
  // (regla de AGENTS.md — nada de acceso optativo sin verificar).
  const consensusWinner = status.winner;
  if (!consensusWinner) {
    throw new Error(
      `confirmResult: estado inconsistente del reto "${challengeId}": consenso alcanzado pero sin ganador registrado`,
    );
  }

  // Guarda central de seguridad (SDD §11): jamás construir una llamada cuyo ganador no sea
  // exactamente el que calculó el conteo de la Fase 2.
  if (!sameAddress(expected, consensusWinner)) {
    throw new Error(
      `confirmResult: el ganador esperado (${expectedWinner}) NO coincide con el ganador del consenso ` +
        `(${consensusWinner}) para el reto "${challengeId}" — se aborta antes de construir la llamada`,
    );
  }

  // El argumento sale del consenso, no del input del caller: el consenso es la fuente de verdad.
  const winner = requireAddress(consensusWinner, "ganador del consenso");

  return {
    address: target,
    abi: CHALLENGE_POOL_ABI,
    functionName: "confirmResult",
    args: [challengeIdAsUint256, winner],
  };
}

/**
 * CAPA DE ENVÍO — mínima interfaz estructural del emisor, para poder inyectar un doble en
 * tests sin arrastrar los genéricos de `WalletClient` y sin usar `any` (regla de AGENTS.md).
 */
export interface ConfirmResultWriter {
  writeContract(call: ConfirmResultCall): Promise<Hex>;
}

export interface OperatorWriterConfig {
  /** Clave de la cuenta operadora. SIEMPRE de `env.OPERATOR_PRIVATE_KEY` (`wrangler secret put`), nunca en código. */
  operatorPrivateKey: string;
  /** RPC de Arbitrum Sepolia (Alchemy) — `env.ARBITRUM_RPC_URL`. */
  rpcUrl: string;
  /** Por defecto Arbitrum Sepolia; parametrizable para el devnode local. */
  chain?: Chain;
}

const PRIVATE_KEY_FORMAT = /^0x[0-9a-fA-F]{64}$/;

/**
 * Crea el emisor real firmado con la cuenta operadora (viem `createWalletClient` +
 * `privateKeyToAccount`, API confirmada contra viem.sh/docs/clients/wallet y
 * viem.sh/docs/contract/writeContract).
 *
 * ⚠️ Sin cobertura de integración: no hay contrato desplegado ni clave operadora todavía
 * (docs/backend-plan.md, Pendientes). Escrito, tipado y revisado — no probado contra una red.
 */
export function createOperatorWriter(config: OperatorWriterConfig): ConfirmResultWriter {
  const { operatorPrivateKey, rpcUrl } = config;
  const chain = config.chain ?? arbitrumSepolia;

  // No se loguea ni se incluye la clave en ningún mensaje de error, solo su forma.
  if (!PRIVATE_KEY_FORMAT.test(operatorPrivateKey)) {
    throw new Error(
      "confirmResult: OPERATOR_PRIVATE_KEY ausente o con formato inválido (se espera 0x + 64 hex)",
    );
  }
  if (rpcUrl.trim() === "") {
    throw new Error("confirmResult: ARBITRUM_RPC_URL ausente");
  }

  const account = privateKeyToAccount(operatorPrivateKey as Hex);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  return {
    async writeContract(call: ConfirmResultCall): Promise<Hex> {
      // Sin `value`: el pozo es USDC (ERC-20), la tx del operador no manda ETH nativo.
      return walletClient.writeContract({
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
        account,
        chain,
      });
    },
  };
}

/** Fuente de la clave operadora y del RPC: solo `env`, nunca constantes del código. */
export interface OperatorEnv {
  OPERATOR_PRIVATE_KEY?: string;
  ARBITRUM_RPC_URL?: string;
}

export function createOperatorWriterFromEnv(env: OperatorEnv, chain?: Chain): ConfirmResultWriter {
  const operatorPrivateKey = env.OPERATOR_PRIVATE_KEY;
  const rpcUrl = env.ARBITRUM_RPC_URL;

  if (!operatorPrivateKey) {
    throw new Error("confirmResult: falta el secret OPERATOR_PRIVATE_KEY (wrangler secret put)");
  }
  if (!rpcUrl) {
    throw new Error("confirmResult: falta el secret ARBITRUM_RPC_URL (wrangler secret put)");
  }

  return createOperatorWriter({ operatorPrivateKey, rpcUrl, chain });
}

/** Envía una llamada YA validada por `buildConfirmResultCall`. No revalida — no es su rol. */
export async function sendConfirmResult(
  call: ConfirmResultCall,
  writer: ConfirmResultWriter,
): Promise<Hex> {
  return writer.writeContract(call);
}

/**
 * Orquestador: valida (capa pura) y solo entonces envía (capa de envío).
 * Si la validación lanza, el writer nunca se toca — eso es exactamente lo que verifica el
 * test negativo de W3.1.
 */
export async function buildAndSendConfirmResult(
  params: BuildConfirmResultCallParams,
  writer: ConfirmResultWriter,
): Promise<Hex> {
  const call = await buildConfirmResultCall(params);
  return sendConfirmResult(call, writer);
}

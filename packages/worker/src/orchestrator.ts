/**
 * Orquestación entre el conteo de consenso (W2.1, ./confirmations.ts) y el envío de
 * `confirmResult` (W3.1, ./confirmTx.ts).
 *
 * Hasta ahora esos dos módulos existían aislados: nadie llamaba a `buildAndSendConfirmResult`
 * cuando `registerConfirmation` alcanzaba consenso. Este módulo es exactamente ese pegamento,
 * y NADA más:
 *
 *   - NO parsea mensajes de Telegram. Recibe un input ya parseado. El formato exacto de los
 *     comandos del bot todavía no está definido por el equipo, así que un adaptador delgado
 *     de Telegram (fuera de este archivo) será el que traduzca el update al input de acá.
 *     `telegram.ts` sigue sin tocarse a propósito.
 *   - NO decide el umbral de consenso (sigue siendo decisión de producto pendiente,
 *     docs/backend-plan.md#pendientes) — lo recibe como dato.
 *   - NO resuelve la identidad de la wallet (W2.2, bloqueado por Privy). Se limita a pasar
 *     la wallet que le den y a propagar el rechazo explícito si no viene.
 *
 * Reglas de la ruta de fondos que este módulo respeta (AGENTS.md + SDD §11):
 *
 *   1. El ganador que termina en la tx sale SIEMPRE del resultado del consenso
 *      (`registerConfirmation().winner`), nunca del `proposedWinner` de la llamada individual.
 *      La guarda dura sigue viviendo en `buildConfirmResultCall` (probada en confirmTx.test.ts);
 *      acá no se duplica esa lógica, solo se le pasa la entrada correcta.
 *   2. Nada de `any`, nada de asumir un campo opcional sin verificarlo.
 *   3. Ninguna promesa rechazada queda sin manejar: el estado real de hoy es que NO hay
 *      contrato desplegado ni secrets cargados (docs/backend-plan.md#pendientes), así que el
 *      camino normal es "no configurado", y eso tiene que ser un resultado tipado, no una
 *      excepción que tumbe el worker.
 */

import type { Hex } from "viem";
import { getChallengeStatus, registerConfirmation } from "./confirmations";
import type {
  ChallengeId,
  ChallengeStatus,
  ConfirmationStore,
  WalletAddress,
} from "./confirmations";
import { buildAndSendConfirmResult } from "./confirmTx";
import type { ConfirmResultWriter } from "./confirmTx";

/**
 * Input YA PARSEADO. Quien construya esto (el futuro adaptador de Telegram, la Mini App, o
 * un test) es responsable de haberlo extraído de su transporte.
 *
 * `walletAddress` admite `null`/`undefined` a propósito: la guarda de W2.2 (rechazo explícito
 * de una confirmación sin wallet verificable) solo tiene sentido si el tipo permite expresar
 * "no vino wallet". No se infiere ni se completa con un valor por defecto en ningún caso.
 */
export interface ProcessConfirmationInput {
  challengeId: ChallengeId;
  walletAddress: WalletAddress | null | undefined;
  proposedWinner: WalletAddress;
  threshold: number;
}

/** Fábrica perezosa del emisor — típicamente `() => createOperatorWriterFromEnv(env)`. */
export type ConfirmResultWriterFactory = () => ConfirmResultWriter;

export interface ProcessConfirmationDeps {
  store: ConfirmationStore;
  /**
   * Dirección del `ChallengePool` desplegado. Opcional porque HOY no hay nada desplegado en
   * ninguna red (docs/backend-plan.md#pendientes): su ausencia es un estado esperado, no un error.
   */
  contractAddress?: string;
  /**
   * Emisor ya construido, o una fábrica que lo construye a demanda.
   *
   * La fábrica es el caso real: `createOperatorWriterFromEnv` LANZA si faltan
   * `OPERATOR_PRIVATE_KEY`/`ARBITRUM_RPC_URL` (que hoy no existen). Ese throw se traduce acá a
   * un resultado "not-configured" — nunca escapa como excepción.
   */
  writer?: ConfirmResultWriter | ConfirmResultWriterFactory;
}

/** Qué pieza de configuración falta para poder enviar la tx. */
export type MissingConfig = "contract-address" | "writer";

/** La confirmación no se registró: sin wallet verificable no se cuenta nada (W2.2). */
export interface ConfirmationRejected {
  outcome: "rejected";
  /** `unspecified` cubre cualquier rechazo futuro de `registerConfirmation` sin asumir su causa. */
  reason: "invalid-wallet" | "unspecified";
}

/** Se registró el voto, pero todavía no hay consenso. No se intenta ninguna tx. */
export interface ConfirmationPending {
  outcome: "pending-consensus";
  /** Estado exacto del reto tras registrar el voto, tal como lo devuelve `getChallengeStatus`. */
  status: ChallengeStatus;
}

/**
 * El consenso de este reto YA se había disparado antes. Se acepta el voto pero no se manda
 * una segunda tx: el plan exige disparar exactamente una vez, sin reintentos ni duplicados.
 */
export interface ConfirmationAlreadyResolved {
  outcome: "already-resolved";
  winner: WalletAddress;
}

/** Hay consenso, pero no hay a dónde ni con qué mandar la tx. Estado normal hoy, no un fallo. */
export interface ConfirmationNotConfigured {
  outcome: "not-configured";
  winner: WalletAddress;
  missing: readonly MissingConfig[];
  detail: string;
}

/** Hay consenso y la tx se envió. `txHash` es exactamente lo que devolvió el emisor. */
export interface ConfirmationSent {
  outcome: "sent";
  winner: WalletAddress;
  txHash: Hex;
}

/** Hay consenso, se intentó enviar y falló (validación de la capa pura, red, revert, etc.). */
export interface ConfirmationSendFailed {
  outcome: "send-failed";
  winner: WalletAddress;
  reason: string;
  /** El error original, sin envolver, por si el caller quiere inspeccionarlo. `unknown`, no `any`. */
  cause: unknown;
}

/**
 * Salvaguarda: `registerConfirmation` dijo que hubo consenso pero no devolvió ganador.
 * No debería pasar; se devuelve tipado en vez de asumir un ganador o hacer un non-null assertion.
 */
export interface ConfirmationInconsistentState {
  outcome: "inconsistent-state";
  detail: string;
}

export type ProcessConfirmationResult =
  | ConfirmationRejected
  | ConfirmationPending
  | ConfirmationAlreadyResolved
  | ConfirmationNotConfigured
  | ConfirmationSent
  | ConfirmationSendFailed
  | ConfirmationInconsistentState;

/** Mensaje legible de cualquier throw/reject, sin usar `any` ni asumir que es un `Error`. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return `error no-Error: ${String(error)}`;
}

function isWriterFactory(
  writer: ConfirmResultWriter | ConfirmResultWriterFactory,
): writer is ConfirmResultWriterFactory {
  return typeof writer === "function";
}

/**
 * Registra una confirmación y, solo si eso alcanzó el consenso, intenta enviar `confirmResult`.
 *
 * Nunca lanza: todos los caminos (incluido "todavía no hay contrato ni secrets") vuelven como
 * una variante del discriminated union.
 */
export async function processConfirmation(
  input: ProcessConfirmationInput,
  deps: ProcessConfirmationDeps,
): Promise<ProcessConfirmationResult> {
  const { challengeId, walletAddress, proposedWinner, threshold } = input;
  const { store } = deps;

  const registration = await registerConfirmation(
    store,
    challengeId,
    walletAddress,
    proposedWinner,
    threshold,
  );

  // 1) Rechazada (hoy: wallet inválida). Se corta acá — no se mira nada de tx.
  if (!registration.accepted) {
    return { outcome: "rejected", reason: registration.reason ?? "unspecified" };
  }

  // 2) El consenso ya se había disparado antes: se acepta el voto, pero no se reintenta la tx.
  if (registration.alreadyTriggered) {
    const previousWinner = registration.winner;
    if (!previousWinner) {
      return {
        outcome: "inconsistent-state",
        detail: `reto "${challengeId}": el consenso figura como ya disparado pero sin ganador registrado`,
      };
    }
    return { outcome: "already-resolved", winner: previousWinner };
  }

  // 3) Registrada, sin consenso todavía: se devuelve el estado real del reto y nada más.
  if (!registration.consensusReached) {
    return { outcome: "pending-consensus", status: await getChallengeStatus(store, challengeId) };
  }

  // `winner` es opcional en el tipo: se verifica en vez de asumirlo (AGENTS.md).
  const winner = registration.winner;
  if (!winner) {
    return {
      outcome: "inconsistent-state",
      detail: `reto "${challengeId}": consenso alcanzado pero \`registerConfirmation\` no devolvió ganador`,
    };
  }

  // 4) Hay consenso. ¿Hay con qué mandar la tx? Hoy normalmente no.
  const { contractAddress, writer: writerOrFactory } = deps;
  const missing: MissingConfig[] = [];
  if (contractAddress === undefined || contractAddress.trim() === "") {
    missing.push("contract-address");
  }
  if (writerOrFactory === undefined) {
    missing.push("writer");
  }
  // Las dos comparaciones extra son redundantes en runtime (ya están en `missing`), pero le dan
  // al compilador el estrechamiento de tipo sin recurrir a un non-null assertion.
  if (missing.length > 0 || contractAddress === undefined || writerOrFactory === undefined) {
    return {
      outcome: "not-configured",
      winner,
      missing,
      detail:
        `consenso alcanzado para el reto "${challengeId}" (ganador ${winner}), pero falta ` +
        `${missing.join(" y ")} — no hay ChallengePool desplegado ni secrets cargados todavía ` +
        `(docs/backend-plan.md#pendientes). No se intentó ninguna transacción.`,
    };
  }

  // La fábrica puede lanzar si faltan los secrets: eso es "no configurado", no un fallo de envío.
  let writer: ConfirmResultWriter;
  try {
    writer = isWriterFactory(writerOrFactory) ? writerOrFactory() : writerOrFactory;
  } catch (error) {
    return {
      outcome: "not-configured",
      winner,
      missing: ["writer"],
      detail: `no se pudo construir el emisor operador: ${describeError(error)}`,
    };
  }

  // 5) Envío. `expectedWinner` es el ganador DEL CONSENSO, no el `proposedWinner` de esta llamada.
  //    La guarda dura que compara ambos vive en `buildConfirmResultCall` (confirmTx.test.ts);
  //    si acá se pasara el valor equivocado, esa guarda lanzaría y esto sería un "send-failed".
  try {
    const txHash = await buildAndSendConfirmResult(
      { store, challengeId, expectedWinner: winner, contractAddress },
      writer,
    );
    return { outcome: "sent", winner, txHash };
  } catch (error) {
    return { outcome: "send-failed", winner, reason: describeError(error), cause: error };
  }
}

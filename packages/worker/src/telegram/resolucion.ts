/**
 * Resolución on-chain de un reto con consenso — la ÚNICA ruta de envío (#26).
 *
 * Todo lo que mueve fondos del pozo pasa por `resolverEnCadena`, y solo después de
 * ganar el derecho de envío (`beginSubmit`, un CAS atómico con lease). Así, `/confirmar`
 * y `/reintentar` comparten una sola ruta y como máximo hay una tx en vuelo por reto.
 *
 * Orden: beginSubmit -> leer `challengeStatus` -> guarda de consenso + envío ->
 * markSubmitted -> esperar recibo -> markConfirmed | markFailed -> historial.
 * El historial se escribe solo cuando `markConfirmed` informa la PRIMERA confirmación.
 *
 * Fuera de alcance (#27): serialización de nonces, unificación de `ChainConfig` y
 * relectura de `Resuelto` posterior al recibo.
 */

import { RECEIPT_TIMEOUT_MS } from "../consensus/core";
import type { ConsensusGateway } from "../consensus/gateway";
import { buildAndSendConfirmResult } from "../confirmTx";
import type { ChainClient } from "./chain";
import { describirErrorDeContrato } from "./errores";
import { keys, readJson, writeJson } from "./store";
import type { KeyValueStore } from "./store";
import type { Historial, RetoRegistrado } from "./retos";

/** Valores de `challengeStatus` del contrato (ver `ESTADOS` en `./chain`). */
const ESTADO_RESUELTO = 2;
const ESTADO_REEMBOLSADO = 3;

const HISTORIAL_VACIO: Historial = { jugados: 0, ganados: 0, totalMovido: 0 };

export interface ResolucionDeps {
  consensus: ConsensusGateway;
  store: KeyValueStore;
  chain: ChainClient;
  /** Reloj inyectable; por defecto `Date.now`. */
  now?: () => number;
}

export type ResolucionResultado =
  /** El reto quedó `confirmed`. `txHash` es null si ya estaba resuelto on-chain. */
  | { kind: "confirmed"; txHash: string | null; alreadySettled: boolean; winner: string }
  /** Otro holder ya lo había confirmado. No se hizo nada. */
  | { kind: "already_confirmed" }
  /** Hay un envío en vuelo con lease vigente. No se hizo nada. */
  | { kind: "in_progress"; phase: string }
  /** Todavía no hay consenso. No se hizo nada. */
  | { kind: "not_ready" }
  /** El reto quedó `failed`. `motivo` es legible para el usuario. */
  | { kind: "failed"; reason: string; motivo: string };

/** Mensaje legible de cualquier error capturado. */
const mensajeDe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const esTimeoutDeRecibo = (error: unknown): boolean =>
  error instanceof Error && (error.name === "WaitForTransactionReceiptTimeoutError" || /timed out/i.test(error.message));

/** Suma el reto al historial de cada participante, marcando al ganador. */
export async function registrarEnHistorial(
  store: KeyValueStore,
  reto: RetoRegistrado,
  ganadorWallet: string,
): Promise<void> {
  const pozo = reto.deposito * reto.participantes.length;
  const ganador = ganadorWallet.toLowerCase();
  for (const p of reto.participantes) {
    const previo = (await readJson<Historial>(store, keys.userHistory(p.userId))) ?? HISTORIAL_VACIO;
    await writeJson(store, keys.userHistory(p.userId), {
      jugados: previo.jugados + 1,
      ganados: previo.ganados + (p.wallet.toLowerCase() === ganador ? 1 : 0),
      totalMovido: previo.totalMovido + pozo,
    });
  }
}

export async function resolverEnCadena(deps: ResolucionDeps, reto: RetoRegistrado): Promise<ResolucionResultado> {
  const { consensus, chain, store } = deps;
  const id = reto.challengeId;
  const now = deps.now ?? Date.now;

  const begin = await consensus.beginSubmit(id, now());
  if (!begin.granted) {
    if (begin.phase === "confirmed") return { kind: "already_confirmed" };
    if (begin.phase === "collecting") return { kind: "not_ready" };
    return { kind: "in_progress", phase: begin.phase };
  }
  const { attempt, winner } = begin;

  const fallar = async (reason: string, motivo: string): Promise<ResolucionResultado> => {
    await consensus.markFailed(id, attempt, reason);
    return { kind: "failed", reason, motivo };
  };

  const confirmar = async (txHash: string | null, alreadySettled: boolean): Promise<ResolucionResultado> => {
    const marca = await consensus.markConfirmed(id, attempt, txHash);
    if (!marca.ok) return { kind: "in_progress", phase: marca.phase };
    // El historial se escribe una sola vez, en la primera confirmación del reto.
    if (marca.firstConfirmation) await registrarEnHistorial(store, reto, winner);
    return { kind: "confirmed", txHash, alreadySettled, winner };
  };

  // Siempre se lee el estado on-chain ANTES de enviar: hace seguro reenviar tras un lease vencido.
  let estado: number;
  try {
    estado = await chain.estadoDeReto(BigInt(id));
  } catch (error) {
    const motivo = mensajeDe(error);
    return fallar(`status_read_failed: ${motivo}`, motivo);
  }
  if (estado === ESTADO_RESUELTO) return confirmar(null, true);
  if (estado === ESTADO_REEMBOLSADO) {
    return fallar("refunded_onchain", "El reto ya fue reembolsado en la cadena, así que no se puede resolver.");
  }

  let txHash: string;
  try {
    // Se reusa la guarda de `confirmTx.ts`: relee el consenso y aborta si el ganador no coincide.
    txHash = await buildAndSendConfirmResult(
      { reader: consensus, challengeId: id, expectedWinner: winner, contractAddress: chain.poolAddress },
      chain.writer,
    );
  } catch (error) {
    const motivo = describirErrorDeContrato(error);
    return fallar(`send_failed: ${motivo}`, motivo);
  }

  const submitted = await consensus.markSubmitted(id, attempt, txHash);
  if (!submitted.ok) return { kind: "in_progress", phase: submitted.phase };

  let recibo: "success" | "reverted";
  try {
    recibo = await chain.esperarRecibo(txHash as `0x${string}`, RECEIPT_TIMEOUT_MS);
  } catch (error) {
    if (esTimeoutDeRecibo(error)) {
      return fallar("receipt_timeout", "La transacción no se confirmó a tiempo.");
    }
    const motivo = mensajeDe(error);
    return fallar(`receipt_error: ${motivo}`, motivo);
  }

  if (recibo === "reverted") {
    return fallar("receipt_reverted", "La transacción se revirtió en la cadena.");
  }
  return confirmar(txHash, false);
}

/**
 * Endpoint de estado de un reto — W4.1 (docs/backend-plan.md, Fase 4).
 * No depende de nada externo (ni Privy ni el contrato), por eso pudo avanzar
 * mientras W2.2/W3.1 seguían bloqueados por respuestas de terceros.
 *
 * Desde #26 lee del ledger durable y expone el ciclo de vida de la tx:
 * `phase`, `txHash` (cuando hay tx) y `failureReason` (cuando falló).
 */

import type { ChallengeId } from "./confirmations";
import type { StatusReader } from "./confirmTx";

export async function handleChallengeStatus(
  challengeId: ChallengeId | undefined,
  reader: StatusReader,
): Promise<Response> {
  if (!challengeId || challengeId.trim() === "") {
    return new Response("Bad Request: falta challengeId", { status: 400 });
  }

  const status = await reader.getStatus(challengeId);
  return Response.json(status);
}

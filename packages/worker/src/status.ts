/**
 * Endpoint de estado de un reto — W4.1 (docs/backend-plan.md, Fase 4).
 * No depende de nada externo (ni Privy ni el contrato), por eso pudo avanzar
 * mientras W2.2/W3.1 seguían bloqueados por respuestas de terceros.
 */

import { getChallengeStatus, type ChallengeId, type ConfirmationStore } from "./confirmations";

export async function handleChallengeStatus(
  challengeId: ChallengeId | undefined,
  store: ConfirmationStore,
): Promise<Response> {
  if (!challengeId || challengeId.trim() === "") {
    return new Response("Bad Request: falta challengeId", { status: 400 });
  }

  const status = await getChallengeStatus(store, challengeId);
  return Response.json(status);
}

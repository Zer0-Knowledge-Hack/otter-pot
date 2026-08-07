/**
 * Worker de OtterPot — orquestador entre el bot de Telegram / Mini App y ChallengePool.
 *
 * Estado actual (W0.1 — scaffold, docs/backend-plan.md): solo expone un health check.
 * El webhook real de Telegram se agrega en la Fase 1 (W1.1).
 */

export interface Env {
  ENVIRONMENT: string;
  // Fase 1+: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, OPERATOR_PRIVATE_KEY,
  // ARBITRUM_RPC_URL (todos vía `wrangler secret put`, nunca hardcodeados).
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", environment: env.ENVIRONMENT });
    }

    return new Response("Not found", { status: 404 });
  },
};

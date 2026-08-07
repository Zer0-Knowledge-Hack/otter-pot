/**
 * Worker de OtterPot — orquestador entre el bot de Telegram / Mini App y ChallengePool.
 *
 * Estado (docs/backend-plan.md):
 *   W0.1 — scaffold + health check.
 *   W1.1 — webhook de Telegram con validación de secret (ver ./telegram.ts).
 */

import { handleTelegramWebhook } from "./telegram";

export interface Env {
  ENVIRONMENT: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  // Fase 1+: TELEGRAM_BOT_TOKEN, OPERATOR_PRIVATE_KEY, ARBITRUM_RPC_URL
  // (todos vía `wrangler secret put`, nunca hardcodeados).
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", environment: env.ENVIRONMENT });
    }

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * Worker de OtterPot — orquestador entre el bot de Telegram / Mini App y ChallengePool.
 *
 * Estado (docs/backend-plan.md):
 *   W0.1 — scaffold + health check.
 *   W1.1 — webhook de Telegram con validación de secret (ver ./telegram.ts).
 *   W2.1 — conteo de confirmaciones y consenso (ver ./confirmations.ts).
 *   W4.1 — endpoint de estado de un reto (ver ./status.ts).
 *
 * El store de confirmaciones es en memoria por ahora (placeholder documentado en
 * confirmations.ts) — no sobrevive de forma confiable entre isolates de Workers en
 * producción. Migrar a KV real es trabajo aparte, pendiente del namespace (ver
 * docs/backend-plan.md). El webhook de Telegram todavía no llama a
 * `registerConfirmation` — eso depende de resolver la identidad de wallet (W2.2,
 * bloqueado por Privy), así que por ahora ambos módulos conviven sin estar conectados.
 */

import { InMemoryConfirmationStore } from "./confirmations";
import { handleChallengeStatus } from "./status";
import { handleTelegramWebhook } from "./telegram";
import { InMemoryStore } from "./telegram/store";

export interface Env {
  ENVIRONMENT: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** Token del bot, de @BotFather. Sin esto el bot no puede contestar nada. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Clave de la cuenta operadora que firma `confirmResult` — W3.1, ver ./confirmTx.ts. */
  OPERATOR_PRIVATE_KEY?: string;
  /** RPC de Arbitrum Sepolia (Alchemy) usado por el writer operador — W3.1. */
  ARBITRUM_RPC_URL?: string;
  /** RPC de la cadena donde vive el pool. En local: el Nitro DevNode. */
  CHAIN_RPC_URL?: string;
  /** Dirección del `ChallengePool` desplegado. */
  CHALLENGE_POOL_ADDRESS?: string;
  // Todos los secretos vienen de `wrangler secret put`, nunca hardcodeados (AGENTS.md).
}

const confirmationStore = new InMemoryConfirmationStore();

/**
 * Estado del bot: configuración por grupo y wallets vinculadas.
 * En memoria por ahora — no sobrevive entre isolates de Workers. Migrar a KV es
 * cambiar esta línea por `new CloudflareKvStore(env.BOT_KV)` (ver STACK.md §2.3).
 */
const botStore = new InMemoryStore();

const CHALLENGE_STATUS_PATH = /^\/challenges\/([^/]+)\/status$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", environment: env.ENVIRONMENT });
    }

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env, botStore);
    }

    const statusMatch = url.pathname.match(CHALLENGE_STATUS_PATH);
    if (statusMatch && request.method === "GET") {
      return handleChallengeStatus(statusMatch[1], confirmationStore);
    }

    return new Response("Not found", { status: 404 });
  },
};

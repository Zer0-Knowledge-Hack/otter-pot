/**
 * Worker de OtterPot — orquestador entre el bot de Telegram / Mini App y ChallengePool.
 *
 * Estado (docs/backend-plan.md):
 *   W0.1 — scaffold + health check.
 *   W1.1 — webhook de Telegram con validación de secret (ver ./telegram.ts).
 *   W2.1 — conteo de confirmaciones y consenso (ver ./consensus).
 *   W4.1 — endpoint de estado de un reto (ver ./status.ts).
 *   #26  — consenso persistente y atómico con ciclo de vida de la tx: un Durable Object
 *          `ConfirmationStore` por reto y un `UpdateDedupe` por chat.
 *
 * Sin los bindings de Durable Objects el worker cae a memoria con un `console.warn`
 * (mismo criterio que `BOT_KV`): sirve para desarrollo, pero NO sobrevive entre isolates.
 */

import { InMemoryUpdateDedupe } from "./consensus/dedupe";
import type { UpdateDedupeGateway } from "./consensus/dedupe";
import { DurableConsensusGateway, DurableUpdateDedupe, InMemoryConsensusGateway } from "./consensus/gateway";
import type { ConsensusGateway, DurableNamespaceLike } from "./consensus/gateway";
import { handleChallengeStatus } from "./status";
import { handleTelegramWebhook } from "./telegram";
import { CloudflareKvStore, InMemoryStore } from "./telegram/store";
import type { CloudflareKvNamespace, KeyValueStore } from "./telegram/store";
import { TelegramApi } from "./telegram/api";
import { registrarComandos } from "./telegram/comandos";

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
  /** URL pública de la Mini App (página de depósito). */
  MINIAPP_URL?: string;
  /** Id de la cadena. Debe coincidir con el RPC o la firma se rechaza. */
  CHAIN_ID?: string;
  /** Dirección del `ChallengePool` desplegado. */
  CHALLENGE_POOL_ADDRESS?: string;
  /** Token del pozo, para escalar montos por sus decimales. */
  USDC_ADDRESS?: string;
  /** Namespace de KV con el estado del bot. Ausente en desarrollo: se usa memoria. */
  BOT_KV?: CloudflareKvNamespace;
  /** Durable Object `ConfirmationStore`, uno por reto. Ausente en desarrollo: se usa memoria. */
  CONFIRMATION_STORE?: DurableNamespaceLike;
  /** Durable Object `UpdateDedupe`, uno por chat. Ausente en desarrollo: no se deduplica. */
  UPDATE_DEDUPE?: DurableNamespaceLike;
  // Todos los secretos vienen de `wrangler secret put`, nunca hardcodeados (AGENTS.md).
}

/**
 * Estado del bot. En producción vive en KV; en desarrollo, en memoria.
 *
 * Un Worker desplegado corre en varios isolates y cada uno tendría su propia
 * memoria: sin KV, quien vincula su wallet en un isolate no existe en el
 * siguiente, y el mapeo entre los retos del grupo y sus id on-chain se pierde
 * en cada reinicio. Por eso el binding manda cuando está.
 */
function resolverStore(env: Env): KeyValueStore {
  return env.BOT_KV ? new CloudflareKvStore(env.BOT_KV) : memoriaLocal;
}

const memoriaLocal = new InMemoryStore();
const consensoLocal = new InMemoryConsensusGateway();
const dedupeLocal = new InMemoryUpdateDedupe();

/** El binding manda cuando está; sin él, memoria local con aviso (no sobrevive entre isolates). */
function resolverConsensus(env: Env): ConsensusGateway {
  if (env.CONFIRMATION_STORE) return new DurableConsensusGateway(env.CONFIRMATION_STORE);
  console.warn("consenso: falta el binding CONFIRMATION_STORE, se usa memoria local (no persiste entre isolates)");
  return consensoLocal;
}

function resolverDedupe(env: Env): UpdateDedupeGateway {
  if (env.UPDATE_DEDUPE) return new DurableUpdateDedupe(env.UPDATE_DEDUPE);
  return dedupeLocal;
}

const CHALLENGE_STATUS_PATH = /^\/challenges\/([^/]+)\/status$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", environment: env.ENVIRONMENT });
    }

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(
        request,
        env,
        resolverStore(env),
        resolverConsensus(env),
        resolverDedupe(env),
      );
    }

    // Registro del menú de comandos. Es una operación de setup que se corre a mano
    // una vez (y de nuevo al agregar comandos), no algo que pase en cada arranque.
    // Se protege con el mismo secreto del webhook: sin él, cualquiera podría
    // reescribir el menú del bot.
    if (url.pathname === "/telegram/registrar-comandos" && request.method === "POST") {
      const secreto = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!env.TELEGRAM_WEBHOOK_SECRET || secreto !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response("Falta TELEGRAM_BOT_TOKEN", { status: 500 });
      }
      try {
        const resultado = await registrarComandos(new TelegramApi(env.TELEGRAM_BOT_TOKEN));
        return Response.json({ ok: true, ...resultado });
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        return Response.json({ ok: false, error: motivo }, { status: 502 });
      }
    }

    const statusMatch = url.pathname.match(CHALLENGE_STATUS_PATH);
    if (statusMatch && request.method === "GET") {
      return handleChallengeStatus(statusMatch[1], resolverConsensus(env));
    }

    return new Response("Not found", { status: 404 });
  },
};

// Wrangler instancia estas clases por nombre: tienen que salir del módulo principal.
export { ConfirmationStore } from "./durable/ConfirmationStore";
export { UpdateDedupe } from "./durable/UpdateDedupe";

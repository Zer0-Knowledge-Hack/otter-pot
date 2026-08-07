/**
 * Webhook de Telegram — W1.1 (docs/backend-plan.md, Fase 1) + enrutado de comandos.
 *
 * Dos responsabilidades, en este orden y sin mezclarse:
 *   1. Autenticar: que el request venga realmente de Telegram
 *      (header X-Telegram-Bot-Api-Secret-Token). Falla cerrado.
 *   2. Delegar el update al router (`./telegram/router.ts`), que decide qué hacer.
 *
 * El webhook SIEMPRE responde 200 tras autenticar, incluso si el manejo del comando
 * falla: Telegram reintenta los updates que no reciben 200, y un error nuestro no
 * debe convertirse en un bucle de reintentos.
 */

import type { Env } from "./index";
import { TelegramApi } from "./telegram/api";
import { configDesdeEnv, crearChainClient } from "./telegram/chain";
import type { ChainClient } from "./telegram/chain";
import { handleUpdate } from "./telegram/router";
import type { KeyValueStore } from "./telegram/store";
import type { TelegramUpdate } from "./telegram/types";

const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  store?: KeyValueStore,
): Promise<Response> {
  const providedSecret = request.headers.get(TELEGRAM_SECRET_HEADER);
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;

  // Falla cerrado: si el secreto no está configurado en el entorno, o el que
  // llega no coincide, se rechaza igual — nunca se acepta un webhook "porque sí".
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Sin token no se puede contestar nada. Se registra y se acepta igual para no
  // provocar reintentos de Telegram — es un error de configuración nuestro.
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn("telegram: falta TELEGRAM_BOT_TOKEN, el update se descarta sin responder");
    return Response.json({ ok: true });
  }

  // Sin store el bot no tiene dónde guardar configuración ni wallets.
  if (!store) {
    console.warn("telegram: no hay store configurado, el update se descarta sin responder");
    return Response.json({ ok: true });
  }

  // La cadena es opcional: sin ella el bot funciona igual y los comandos que
  // escriben avisan que no está configurada, en vez de reventar.
  let chain: ChainClient | undefined;
  try {
    chain = crearChainClient(configDesdeEnv(env));
  } catch (error) {
    console.warn("telegram: sin cadena configurada —", error instanceof Error ? error.message : error);
  }

  try {
    await handleUpdate(update, {
      transport: new TelegramApi(env.TELEGRAM_BOT_TOKEN),
      store,
      chain,
    });
  } catch (error) {
    // Se traga el error a propósito: ya autenticamos, así que devolvemos 200 y
    // dejamos rastro en los logs. Un 500 acá haría que Telegram reintente en bucle.
    console.error("telegram: fallo manejando el update:", error);
  }

  return Response.json({ ok: true });
}

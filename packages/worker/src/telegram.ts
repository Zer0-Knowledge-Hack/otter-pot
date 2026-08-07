/**
 * Webhook de Telegram — W1.1 (docs/backend-plan.md, Fase 1).
 *
 * Responsabilidad única acá: validar que el request viene realmente de Telegram
 * (header X-Telegram-Bot-Api-Secret-Token) antes de aceptar cualquier payload.
 * El conteo de confirmaciones y la lógica de negocio se agregan en la Fase 2 (W2.1/W2.2)
 * — a propósito no está acá todavía, para no mezclar autenticación con lógica de negocio.
 */

import type { Env } from "./index";

const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const providedSecret = request.headers.get(TELEGRAM_SECRET_HEADER);
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;

  // Falla cerrado: si el secreto no está configurado en el entorno, o el que
  // llega no coincide, se rechaza igual — nunca se acepta un webhook "porque sí".
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Placeholder de Fase 1: confirma que el update llegó y fue autenticado.
  // Fase 2 reemplaza este cuerpo por el registro real de confirmaciones.
  console.log("Telegram update recibido:", JSON.stringify(update));

  return Response.json({ ok: true });
}

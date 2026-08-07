/**
 * Cliente de la Bot API de Telegram — `fetch` directo, sin framework.
 *
 * Motivo (`BOT.md` §9): las librerías de bots asumen Node completo y long polling.
 * Cloudflare Workers no sostiene conexiones largas, así que todo va por webhook y
 * las respuestas son llamadas HTTP sueltas. Son cuatro métodos; no vale la dependencia.
 */

import type { InlineKeyboardMarkup, TelegramChatMember } from "./types";
import { isAdminStatus } from "./types";

const API_BASE = "https://api.telegram.org";

export interface SendMessageOptions {
  /** Teclado de botones (armado de retos, `BOT.md` §4). */
  replyMarkup?: InlineKeyboardMarkup;
  /** Responder citando un mensaje concreto. */
  replyToMessageId?: number;
  /** Telegram admite `HTML` y `MarkdownV2`; usamos HTML por ser menos quisquilloso al escapar. */
  parseMode?: "HTML";
}

/**
 * Interfaz mínima del transporte, para poder inyectar un doble en tests sin
 * pegarle a la red ni usar `any` (regla de `AGENTS.md`).
 */
export interface TelegramTransport {
  call(method: string, payload: Record<string, unknown>): Promise<unknown>;
}

export class TelegramApi implements TelegramTransport {
  constructor(private readonly botToken: string) {
    if (!botToken || botToken.trim() === "") {
      throw new Error("telegram: falta TELEGRAM_BOT_TOKEN");
    }
  }

  async call(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${API_BASE}/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Telegram siempre responde 200 con `ok:false` en los errores de negocio,
    // así que no alcanza con mirar el status HTTP.
    const body = (await response.json()) as { ok?: boolean; description?: string };
    if (!body.ok) {
      throw new Error(`telegram: ${method} falló — ${body.description ?? "sin descripción"}`);
    }
    return body;
  }
}

/** Escapa lo que rompe el parseo HTML de Telegram. Se aplica a TODO texto de usuario. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Envía un mensaje y devuelve su `message_id`, necesario para editarlo después
 * (la lista del armado se refresca in situ en vez de spamear el grupo).
 * Devuelve `null` si Telegram no informó el id.
 */
export async function sendMessage(
  transport: TelegramTransport,
  chatId: number,
  text: string,
  options: SendMessageOptions = {},
): Promise<number | null> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode ?? "HTML",
  };
  if (options.replyMarkup) payload["reply_markup"] = options.replyMarkup;
  if (options.replyToMessageId) payload["reply_to_message_id"] = options.replyToMessageId;

  const body = (await transport.call("sendMessage", payload)) as {
    result?: { message_id?: number };
  };
  return body.result?.message_id ?? null;
}

/** Reemplaza el texto de un mensaje ya enviado — se usa para refrescar la lista del armado. */
export async function editMessageText(
  transport: TelegramTransport,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) payload["reply_markup"] = replyMarkup;

  await transport.call("editMessageText", payload);
}

/**
 * Obligatorio tras cada botón: si no se responde, Telegram deja el reloj girando
 * en el cliente del usuario (`BOT.md` §9).
 */
export async function answerCallbackQuery(
  transport: TelegramTransport,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const payload: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) payload["text"] = text;

  await transport.call("answerCallbackQuery", payload);
}

/**
 * Devuelve si el usuario es admin del grupo. Ante cualquier error de la API
 * responde `false`: falla cerrado, nunca concede permisos por defecto.
 */
export async function isGroupAdmin(
  transport: TelegramTransport,
  chatId: number,
  userId: number,
): Promise<boolean> {
  try {
    const body = (await transport.call("getChatMember", {
      chat_id: chatId,
      user_id: userId,
    })) as { result?: TelegramChatMember };

    const status = body.result?.status;
    return status !== undefined && isAdminStatus(status);
  } catch {
    return false;
  }
}

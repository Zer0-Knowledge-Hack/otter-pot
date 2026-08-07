/**
 * Tipos mínimos de la Bot API de Telegram — solo lo que el bot usa.
 *
 * Se declaran a mano en vez de traer una dependencia entera: el worker corre en
 * Cloudflare Workers y `AGENTS.md` prohíbe `any` en el código que toca el contrato.
 * Referencia: https://core.telegram.org/bots/api
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export type ChatType = "private" | "group" | "supergroup" | "channel";

export interface TelegramChat {
  id: number;
  type: ChatType;
  title?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  /** Presente cuando el mensaje trae foto. Se usa para la evidencia (`BOT.md` §5.3). */
  photo?: TelegramPhotoSize[];
  caption?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  /** Payload del botón: `accion:argumento` (ver `router.ts`). */
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/** Miembro de un chat — se usa para saber si quien escribe es admin. */
export interface TelegramChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TelegramUser;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/** Un chat es "grupal" si el reto vive ahí; los privados son para wallet y ayuda. */
export function isGroupChat(chat: TelegramChat): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

/** Quien tiene `creator` o `administrator` puede tocar la configuración del grupo. */
export function isAdminStatus(status: TelegramChatMember["status"]): boolean {
  return status === "creator" || status === "administrator";
}

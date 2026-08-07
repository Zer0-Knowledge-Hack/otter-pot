/**
 * Armado de retos (`BOT.md` §4).
 *
 * Existe porque la Bot API de Telegram **no permite listar los miembros de un grupo**
 * (hay `getChatMemberCount` y `getChatMember(user_id)`, pero ningún método de listado),
 * y el contrato exige la lista completa de participantes al crear el reto:
 * `create_challenge(required_deposit, deadline, participants_list)`.
 *
 * Entonces la lista se arma antes, con la gente anotándose sola. Mientras dura el
 * armado no hay nada en la cadena: descartarlo es gratis y reversible.
 *
 * Este módulo es lógica pura: sin red, sin claves, sin Telegram. Solo estado y reglas.
 */

import { keys, readJson, writeJson } from "./store";
import type { KeyValueStore } from "./store";
import type { InlineKeyboardMarkup } from "./types";

export interface Participante {
  userId: number;
  /** Nombre visible en Telegram, para mostrar en la lista. */
  nombre: string;
  wallet: string;
}

export interface Assembly {
  id: string;
  chatId: number;
  creatorId: number;
  deposito: number;
  plazo: number;
  participantes: Participante[];
  /** Mensaje del grupo que muestra la lista, para poder editarlo al vuelo. */
  messageId: number | null;
  createdAt: number;
}

/** Mínimo para que un reto tenga sentido: alguien contra alguien. */
export const MIN_PARTICIPANTES = 2;

const ALFABETO = "abcdefghijkmnpqrstuvwxyz23456789"; // sin l/o/0/1: se confunden al leer

export function generarId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 3; i++) {
    id += ALFABETO[Math.floor(random() * ALFABETO.length)] ?? "a";
  }
  return id;
}

export function crearArmado(params: {
  id: string;
  chatId: number;
  creatorId: number;
  deposito: number;
  plazo: number;
  ahora?: number;
}): Assembly {
  return {
    id: params.id,
    chatId: params.chatId,
    creatorId: params.creatorId,
    deposito: params.deposito,
    plazo: params.plazo,
    participantes: [],
    messageId: null,
    createdAt: params.ahora ?? Math.floor(Date.now() / 1000),
  };
}

export type ResultadoSumar =
  | { ok: true; assembly: Assembly; yaEstaba: false }
  | { ok: true; assembly: Assembly; yaEstaba: true }
  | { ok: false; error: string };

/**
 * Suma un participante. Idempotente: si ya estaba, no duplica y lo informa —
 * un doble toque al botón no debe romper nada ni ensuciar la lista.
 */
export function sumarse(assembly: Assembly, participante: Participante): ResultadoSumar {
  const yaEstaba = assembly.participantes.some((p) => p.userId === participante.userId);
  if (yaEstaba) {
    return { ok: true, assembly, yaEstaba: true };
  }
  return {
    ok: true,
    assembly: { ...assembly, participantes: [...assembly.participantes, participante] },
    yaEstaba: false,
  };
}

export function bajarse(assembly: Assembly, userId: number): Assembly {
  return {
    ...assembly,
    participantes: assembly.participantes.filter((p) => p.userId !== userId),
  };
}

export type ResultadoAbrir =
  | { ok: true }
  | { ok: false; error: string };

/** Reglas para pasar de armado a reto on-chain. */
export function puedeAbrir(assembly: Assembly, quienAbre: number): ResultadoAbrir {
  if (quienAbre !== assembly.creatorId) {
    return { ok: false, error: "Solo quien armó el reto puede abrirlo." };
  }
  if (assembly.participantes.length < MIN_PARTICIPANTES) {
    return {
      ok: false,
      error: `Necesitás al menos ${MIN_PARTICIPANTES} anotados para abrir el reto. Van ${assembly.participantes.length}.`,
    };
  }
  return { ok: true };
}

/** Plazo absoluto en epoch-segundos, que es lo que espera el contrato. */
export function calcularDeadline(assembly: Assembly, ahora: number = Math.floor(Date.now() / 1000)): number {
  return ahora + assembly.plazo * 3600;
}

// ─── Persistencia ────────────────────────────────────────────────────────────

export async function guardar(store: KeyValueStore, assembly: Assembly): Promise<void> {
  await writeJson(store, keys.assembly(assembly.chatId, assembly.id), assembly);
}

export async function leer(
  store: KeyValueStore,
  chatId: number,
  id: string,
): Promise<Assembly | null> {
  return readJson<Assembly>(store, keys.assembly(chatId, id));
}

export async function borrar(store: KeyValueStore, chatId: number, id: string): Promise<void> {
  await store.delete(keys.assembly(chatId, id));
}

export async function listar(store: KeyValueStore, chatId: number): Promise<Assembly[]> {
  const claves = await store.list(keys.assemblyPrefix(chatId));
  const armados: Assembly[] = [];
  for (const clave of claves) {
    const a = await readJson<Assembly>(store, clave);
    if (a) armados.push(a);
  }
  return armados.sort((a, b) => a.createdAt - b.createdAt);
}

// ─── Presentación ────────────────────────────────────────────────────────────

function describirUmbral(umbral: string | number, participantes: number): string {
  if (typeof umbral === "number") return `${Math.min(umbral, participantes)} confirmaciones`;
  if (umbral === "unanimidad") return "unanimidad";
  if (umbral === "todos-menos-uno") return "todos menos uno";
  return "mayoría simple";
}

export function renderArmado(assembly: Assembly, umbral: string | number): string {
  const n = assembly.participantes.length;
  const lista =
    n === 0
      ? "<i>nadie todavía</i>"
      : assembly.participantes.map((p) => `• ${p.nombre}`).join("\n");

  const pozo = assembly.deposito * n;

  return [
    `🦦 <b>Reto en armado</b> <code>${assembly.id}</code>`,
    "",
    `💰 ${assembly.deposito} USDC por cabeza · ⏱ ${assembly.plazo} h`,
    `🗳 Se resuelve por ${describirUmbral(umbral, Math.max(n, 1))}`,
    "",
    `<b>Anotados (${n})</b>`,
    lista,
    "",
    n > 0 ? `Pozo si abre ahora: <b>${pozo} USDC</b>` : "Tocá <b>Me sumo</b> para entrar.",
    "",
    `<i>Todavía no hay nada en la cadena. El creador abre con</i> <code>/abrir ${assembly.id}</code>`,
  ].join("\n");
}

export function tecladoArmado(assemblyId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✋ Me sumo", callback_data: `sumar:${assemblyId}` },
        { text: "🚪 Me bajo", callback_data: `bajar:${assemblyId}` },
      ],
    ],
  };
}

/** Payload de los botones: `accion:id`. Devuelve null si no tiene esa forma. */
export function parseCallback(data: string): { accion: string; id: string } | null {
  const partes = data.split(":");
  const accion = partes[0];
  const id = partes[1];
  if (accion === undefined || id === undefined || accion === "" || id === "") return null;
  return { accion, id };
}

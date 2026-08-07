/**
 * Handlers de retos — etapa 2 de `BOT.md` §8.
 *
 * Separado del router para que `router.ts` siga siendo un dispatch legible y toda
 * la lógica de armado/apertura viva junta. Nada de esto habla con Telegram
 * directamente salvo por el transporte que recibe.
 */

import { editMessageText, escapeHtml, sendMessage } from "./api";
import type { TelegramTransport } from "./api";
import { calcularUmbral, getConfig } from "./config";
import {
  borrar,
  calcularDeadline,
  crearArmado,
  generarId,
  guardar,
  leer,
  listar,
  puedeAbrir,
  renderArmado,
  tecladoArmado,
  bajarse,
  sumarse,
} from "./assembly";
import type { Assembly } from "./assembly";
import { describirEstado } from "./chain";
import type { ChainClient } from "./chain";
import { keys, readJson, writeJson } from "./store";
import type { KeyValueStore } from "./store";
import { obtenerWallet } from "./wallets";
import type { Address } from "viem";

/** Reto ya creado en la cadena, indexado por el grupo que lo abrió. */
export interface RetoRegistrado {
  challengeId: string;
  chatId: number;
  deposito: number;
  participantes: { userId: number; nombre: string; wallet: string }[];
  umbral: number;
  txHash: string;
  createdAt: number;
}

export interface RetosDeps {
  transport: TelegramTransport;
  store: KeyValueStore;
  chain?: ChainClient;
}

const SIN_CADENA =
  "No tengo la cadena configurada, así que no puedo escribir el reto. Avisale a quien administra el bot.";

// ─── /nuevo ──────────────────────────────────────────────────────────────────

export async function handleNuevo(
  deps: RetosDeps,
  chatId: number,
  userId: number,
  args: string[],
  esAdmin: boolean,
): Promise<void> {
  const config = await getConfig(deps.store, chatId);

  if (config.crear === "admins" && !esAdmin) {
    await sendMessage(deps.transport, chatId, "En este grupo solo los admins pueden abrir retos.");
    return;
  }

  const deposito = parsePositivo(args[0]) ?? config.deposito;
  const plazo = parsePositivo(args[1]) ?? config.plazo;

  const assembly = crearArmado({ id: generarId(), chatId, creatorId: userId, deposito, plazo });

  const messageId = await sendMessage(
    deps.transport,
    chatId,
    renderArmado(assembly, config.umbral),
    { replyMarkup: tecladoArmado(assembly.id) },
  );

  assembly.messageId = messageId;
  await guardar(deps.store, assembly);
}

function parsePositivo(valor: string | undefined): number | null {
  if (valor === undefined || !/^[0-9]+$/.test(valor)) return null;
  const n = Number.parseInt(valor, 10);
  return n > 0 ? n : null;
}

// ─── Botones del armado ──────────────────────────────────────────────────────

/** Devuelve el texto para el `answerCallbackQuery` — el aviso efímero al usuario. */
export async function handleBotonArmado(
  deps: RetosDeps,
  accion: string,
  assemblyId: string,
  chatId: number,
  userId: number,
  nombre: string,
): Promise<string> {
  const assembly = await leer(deps.store, chatId, assemblyId);
  if (!assembly) return "Ese armado ya no existe.";

  const config = await getConfig(deps.store, chatId);
  let actualizado: Assembly;

  if (accion === "sumar") {
    const wallet = await obtenerWallet(deps.store, userId);
    if (!wallet) {
      // No se puede participar sin wallet: el contrato necesita una dirección.
      return "Primero vinculá tu wallet: escribime por privado /vincular 0x…";
    }
    const resultado = sumarse(assembly, { userId, nombre, wallet: wallet.address });
    if (!resultado.ok) return resultado.error;
    if (resultado.yaEstaba) return "Ya estabas anotado.";
    actualizado = resultado.assembly;
  } else if (accion === "bajar") {
    if (!assembly.participantes.some((p) => p.userId === userId)) {
      return "No estabas anotado.";
    }
    actualizado = bajarse(assembly, userId);
  } else {
    return "No entiendo ese botón.";
  }

  await guardar(deps.store, actualizado);

  if (actualizado.messageId !== null) {
    await editMessageText(
      deps.transport,
      chatId,
      actualizado.messageId,
      renderArmado(actualizado, config.umbral),
      tecladoArmado(actualizado.id),
    );
  }

  return accion === "sumar" ? "Anotado ✅" : "Te bajaste";
}

// ─── /abrir ──────────────────────────────────────────────────────────────────

export async function handleAbrir(
  deps: RetosDeps,
  chatId: number,
  userId: number,
  assemblyId: string | undefined,
): Promise<void> {
  const responder = (t: string): Promise<number | null> => sendMessage(deps.transport, chatId, t);

  if (!assemblyId) {
    await responder("Faltó el id. Ejemplo: <code>/abrir a3f</code> — mirá <code>/retos</code>.");
    return;
  }

  const assembly = await leer(deps.store, chatId, assemblyId);
  if (!assembly) {
    await responder(`No encuentro el armado <code>${escapeHtml(assemblyId)}</code>. Mirá <code>/retos</code>.`);
    return;
  }

  const permitido = puedeAbrir(assembly, userId);
  if (!permitido.ok) {
    await responder(permitido.error);
    return;
  }

  if (!deps.chain) {
    await responder(SIN_CADENA);
    return;
  }

  await responder("⛓ Escribiendo el reto en la cadena…");

  try {
    const config = await getConfig(deps.store, chatId);
    const deadline = BigInt(calcularDeadline(assembly));
    const participantes = assembly.participantes.map((p) => p.wallet as Address);

    const { challengeId, txHash } = await deps.chain.crearReto(
      BigInt(assembly.deposito),
      deadline,
      participantes,
    );

    const umbral = calcularUmbral(config.umbral, participantes.length);
    const reto: RetoRegistrado = {
      challengeId: challengeId.toString(),
      chatId,
      deposito: assembly.deposito,
      participantes: assembly.participantes,
      umbral,
      txHash,
      createdAt: Math.floor(Date.now() / 1000),
    };

    await writeJson(deps.store, keys.challenge(chatId, reto.challengeId), reto);
    await borrar(deps.store, chatId, assembly.id);

    await responder(
      [
        `✅ <b>Reto #${reto.challengeId} creado</b>`,
        "",
        `💰 ${assembly.deposito} USDC por cabeza · pozo de ${assembly.deposito * participantes.length} USDC`,
        `👥 ${participantes.length} participantes · se resuelve con ${umbral} confirmaciones`,
        "",
        `<code>${escapeHtml(txHash)}</code>`,
        "",
        `Ahora cada uno deposita: <code>/depositar ${reto.challengeId}</code>`,
      ].join("\n"),
    );
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    await responder(`No pude escribir en la cadena: ${escapeHtml(motivo)}\nEl armado sigue intacto.`);
  }
}

// ─── /descartar ──────────────────────────────────────────────────────────────

export async function handleDescartar(
  deps: RetosDeps,
  chatId: number,
  userId: number,
  assemblyId: string | undefined,
): Promise<void> {
  const responder = (t: string): Promise<number | null> => sendMessage(deps.transport, chatId, t);

  if (!assemblyId) {
    await responder("Faltó el id. Ejemplo: <code>/descartar a3f</code>");
    return;
  }
  const assembly = await leer(deps.store, chatId, assemblyId);
  if (!assembly) {
    await responder(`No encuentro el armado <code>${escapeHtml(assemblyId)}</code>.`);
    return;
  }
  if (assembly.creatorId !== userId) {
    await responder("Solo quien armó el reto puede descartarlo.");
    return;
  }

  await borrar(deps.store, chatId, assemblyId);
  await responder("🗑 Armado descartado. No había nada en la cadena, así que no costó nada.");
}

// ─── /retos ──────────────────────────────────────────────────────────────────

export async function handleRetos(deps: RetosDeps, chatId: number): Promise<void> {
  const armados = await listar(deps.store, chatId);
  const claves = await deps.store.list(keys.challengePrefix(chatId));

  const lineas: string[] = ["🦦 <b>Retos de este grupo</b>", ""];

  if (armados.length > 0) {
    lineas.push("<b>En armado</b>");
    for (const a of armados) {
      lineas.push(`• <code>${a.id}</code> — ${a.deposito} USDC · ${a.participantes.length} anotados`);
    }
    lineas.push("");
  }

  if (claves.length > 0) {
    lineas.push("<b>En la cadena</b>");
    for (const clave of claves) {
      const reto = await readJson<RetoRegistrado>(deps.store, clave);
      if (!reto) continue;
      let estado = "—";
      if (deps.chain) {
        try {
          estado = describirEstado(await deps.chain.estadoDeReto(BigInt(reto.challengeId)));
        } catch {
          estado = "sin poder leer";
        }
      }
      lineas.push(`• <b>#${reto.challengeId}</b> — ${estado} · pozo ${reto.deposito * reto.participantes.length} USDC`);
    }
    lineas.push("");
  }

  if (armados.length === 0 && claves.length === 0) {
    lineas.push("<i>No hay ninguno todavía. Empezá con</i> <code>/nuevo</code>");
  }

  await sendMessage(deps.transport, chatId, lineas.join("\n"));
}

// ─── /estado ─────────────────────────────────────────────────────────────────

export async function handleEstado(
  deps: RetosDeps,
  chatId: number,
  retoId: string | undefined,
): Promise<void> {
  const responder = (t: string): Promise<number | null> => sendMessage(deps.transport, chatId, t);

  if (!retoId) {
    await responder("Faltó el id. Ejemplo: <code>/estado 0</code> — mirá <code>/retos</code>.");
    return;
  }

  const reto = await readJson<RetoRegistrado>(deps.store, keys.challenge(chatId, retoId));
  if (!reto) {
    await responder(`No encuentro el reto <code>${escapeHtml(retoId)}</code> en este grupo. Mirá <code>/retos</code>.`);
    return;
  }

  let estado = "sin poder leer";
  if (deps.chain) {
    try {
      estado = describirEstado(await deps.chain.estadoDeReto(BigInt(reto.challengeId)));
    } catch {
      /* se muestra el valor por defecto */
    }
  }

  await responder(
    [
      `🦦 <b>Reto #${reto.challengeId}</b> — ${estado}`,
      "",
      `💰 ${reto.deposito} USDC por cabeza · pozo ${reto.deposito * reto.participantes.length} USDC`,
      `🗳 Se resuelve con ${reto.umbral} confirmaciones`,
      "",
      "<b>Participantes</b>",
      ...reto.participantes.map((p) => `• ${p.nombre}`),
    ].join("\n"),
  );
}


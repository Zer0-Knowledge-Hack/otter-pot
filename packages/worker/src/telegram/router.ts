/**
 * Router de comandos del bot (`BOT.md` §3).
 *
 * Se enruta la superficie COMPLETA desde el día uno. Lo que todavía no está
 * implementado responde «todavía no disponible» de forma explícita, nunca con
 * silencio ni con un error genérico. Agregar una función después es cambiar una
 * rama de este switch, jamás reestructurar el bot.
 */

import { answerCallbackQuery, escapeHtml, isGroupAdmin, sendMessage } from "./api";
import type { TelegramTransport } from "./api";
import { aplicarSet, getConfig, renderConfig, resetConfig, saveConfig } from "./config";
import type { KeyValueStore } from "./store";
import { desvincular, enmascarar, esDireccionValida, obtenerWallet, vincular } from "./wallets";
import { isGroupChat } from "./types";
import type { TelegramUpdate } from "./types";
import { parseCallback } from "./assembly";
import type { ChainClient } from "./chain";
import type { ConfirmationStore } from "../confirmations";
import {
  handleAbrir,
  handleBotonArmado,
  handleDescartar,
  handleEstado,
  handleNuevo,
  handleRetos,
  handleConfirmar,
  handleReembolso,
  handleHistorial,
} from "./retos";

export interface RouterDeps {
  transport: TelegramTransport;
  store: KeyValueStore;
  /** Sin cadena configurada, los comandos que escriben avisan en vez de fallar. */
  chain?: ChainClient;
  /** Conteo de consenso (W2.1). Sin esto, `/confirmar` no puede registrar votos. */
  confirmations?: ConfirmationStore;
}

interface ParsedCommand {
  name: string;
  args: string[];
}

/**
 * Extrae el comando de un texto. Tolera el sufijo del bot: en grupos Telegram
 * entrega `/estado@otterpot_bot` en vez de `/estado` (`BOT.md` §9).
 */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const partes = trimmed.split(/\s+/);
  const rawCommand = partes[0];
  if (rawCommand === undefined) return null;

  // `/estado@otterpot_bot` → `estado`. El sufijo lo agrega Telegram en grupos.
  const name = (rawCommand.slice(1).split("@")[0] ?? "").toLowerCase();
  if (name === "") return null;

  return { name, args: partes.slice(1) };
}

const NO_DISPONIBLE_CONTRATO =
  "Todavía no está habilitado: necesita la próxima versión del contrato. Está diseñado y en camino.";
const NO_DISPONIBLE_MINIAPP =
  "Todavía no está habilitado: necesita la Mini App para que firmes desde tu wallet. Está diseñado y en camino.";
const NO_DISPONIBLE_PRONTO =
  "Todavía no está habilitado. Es lo próximo que se implementa.";

const AYUDA_PRIVADO = [
  "🦦 <b>OtterPot</b> — retos con pozo compartido, sin que nadie guarde la plata.",
  "",
  "<b>Tu wallet</b>",
  "<code>/vincular 0x…</code> — asociá tu wallet",
  "<code>/miwallet</code> — ver la que tenés vinculada",
  "<code>/desvincular</code> — borrar la asociación",
  "",
  "<b>Para jugar</b>",
  "Agregame a un grupo y escribí <code>/nuevo</code> ahí.",
  "Los retos viven en los grupos, no en el chat privado.",
].join("\n");

const AYUDA_GRUPO = [
  "🦦 <b>Comandos de OtterPot</b>",
  "",
  "<b>Retos</b>",
  "<code>/nuevo [usdc] [horas]</code> — armar un reto",
  "<code>/abrir [id]</code> — cerrar la lista y crearlo en la cadena",
  "<code>/descartar [id]</code> — cancelar un armado (gratis)",
  "<code>/retos</code> — retos activos",
  "<code>/estado [id]</code> — pozo, depósitos y confirmaciones",
  "<code>/confirmar [id] @usuario</code> — votar al ganador",
  "<code>/reembolso [id]</code> — devolver si venció el plazo",
  "<code>/historial [@usuario]</code> — retos jugados y ganados",
  "",
  "<b>Configuración</b> (solo admins)",
  "<code>/config</code> — ver la configuración del grupo",
  "<code>/set &lt;opción&gt; &lt;valor&gt;</code> — cambiar una opción",
  "<code>/reset</code> — volver a los valores por defecto",
  "",
  "Tu wallet se vincula por privado: <code>/vincular 0x…</code>",
].join("\n");

export async function handleUpdate(update: TelegramUpdate, deps: RouterDeps): Promise<void> {
  if (update.callback_query) {
    // Los botones del armado llegan acá. SIEMPRE hay que responder o Telegram
    // deja el reloj girando en el cliente (`BOT.md` §9), así que el
    // answerCallbackQuery va en un finally implícito: pase lo que pase, se contesta.
    const cb = update.callback_query;
    let aviso = "No entiendo ese botón.";
    try {
      const parsed = cb.data ? parseCallback(cb.data) : null;
      const chatId = cb.message?.chat.id;
      if (parsed && chatId !== undefined) {
        const nombre = cb.from.username ? `@${cb.from.username}` : cb.from.first_name;
        aviso = await handleBotonArmado(deps, parsed.accion, parsed.id, chatId, cb.from.id, nombre);
      }
    } catch (error) {
      console.error("telegram: fallo manejando el botón:", error);
      aviso = "Algo falló. Probá de nuevo.";
    }
    await answerCallbackQuery(deps.transport, cb.id, aviso);
    return;
  }

  const message = update.message;
  if (!message?.text || !message.from) return;

  const parsed = parseCommand(message.text);
  if (!parsed) return; // Texto suelto en un grupo: el bot no interrumpe.

  const chatId = message.chat.id;
  const userId = message.from.id;
  const enGrupo = isGroupChat(message.chat);

  // Descarta el message_id: solo el armado necesita editar su propio mensaje.
  const responder = async (text: string): Promise<void> => {
    await sendMessage(deps.transport, chatId, text);
  };

  switch (parsed.name) {
    // ── Inicio y ayuda ──────────────────────────────────────────────────────
    case "start":
      return responder(enGrupo ? AYUDA_GRUPO : AYUDA_PRIVADO);

    case "ayuda":
    case "help":
      return responder(enGrupo ? AYUDA_GRUPO : AYUDA_PRIVADO);

    case "nutria":
      return responder("🦦 Una nutria sostiene la olla para que nadie se la lleve. Ese es todo el producto.");

    // ── Wallet ──────────────────────────────────────────────────────────────
    case "vincular": {
      if (enGrupo) {
        return responder("Mejor por privado: escribime y mandá <code>/vincular 0x…</code> ahí.");
      }
      const address = parsed.args[0];
      if (!address) {
        return responder("Faltó la dirección. Ejemplo: <code>/vincular 0x1234…abcd</code>");
      }
      if (!esDireccionValida(address)) {
        return responder(
          `Eso no parece una dirección válida: <code>${escapeHtml(address)}</code>\nTiene que empezar con <code>0x</code> y seguir con 40 caracteres hexadecimales.`,
        );
      }
      const wallet = await vincular(deps.store, userId, address);
      return responder(
        [
          `✅ Wallet vinculada: <code>${escapeHtml(wallet.address)}</code>`,
          "",
          "⚠️ <b>Sin verificar.</b> Todavía no puedo comprobar que esta wallet sea tuya —",
          "confío en tu palabra. Sirve para retos entre conocidos, no para dinero ajeno.",
        ].join("\n"),
      );
    }

    case "miwallet": {
      const wallet = await obtenerWallet(deps.store, userId);
      if (!wallet) {
        return responder("Todavía no vinculaste una wallet. Escribime por privado: <code>/vincular 0x…</code>");
      }
      const mostrada = enGrupo ? enmascarar(wallet.address) : wallet.address;
      const sello = wallet.verified ? "verificada" : "sin verificar";
      return responder(`Tu wallet: <code>${escapeHtml(mostrada)}</code> (${sello})`);
    }

    case "desvincular": {
      if (enGrupo) return responder("Mejor por privado: escribime y mandá <code>/desvincular</code> ahí.");
      await desvincular(deps.store, userId);
      return responder("Listo, borré la asociación. Podés vincular otra con <code>/vincular 0x…</code>");
    }

    // ── Configuración ───────────────────────────────────────────────────────
    case "config": {
      if (!enGrupo) return responder("La configuración es por grupo. Usá este comando adentro del grupo.");
      const config = await getConfig(deps.store, chatId);
      return responder(renderConfig(config));
    }

    case "set": {
      if (!enGrupo) return responder("La configuración es por grupo. Usá este comando adentro del grupo.");
      if (!(await isGroupAdmin(deps.transport, chatId, userId))) {
        return responder("Solo los admins del grupo pueden cambiar la configuración.");
      }
      const [clave, ...resto] = parsed.args;
      if (!clave) {
        return responder("Faltó qué cambiar. Ejemplo: <code>/set umbral unanimidad</code>\nMirá <code>/config</code> para ver las opciones.");
      }
      if (clave.toLowerCase() === "juez") {
        return responder(NO_DISPONIBLE_CONTRATO);
      }
      const actual = await getConfig(deps.store, chatId);
      const resultado = aplicarSet(actual, clave, resto.join(" "));
      if (!resultado.ok) return responder(resultado.error);

      await saveConfig(deps.store, chatId, resultado.config);
      const confirmacion = `✅ Actualizado: <b>${escapeHtml(clave.toLowerCase())}</b>`;
      return responder(resultado.aviso ? `${confirmacion}\n\n${resultado.aviso}` : confirmacion);
    }

    case "reset": {
      if (!enGrupo) return responder("La configuración es por grupo. Usá este comando adentro del grupo.");
      if (!(await isGroupAdmin(deps.transport, chatId, userId))) {
        return responder("Solo los admins del grupo pueden cambiar la configuración.");
      }
      await resetConfig(deps.store, chatId);
      return responder("✅ Configuración restablecida a los valores por defecto. Mirá <code>/config</code>.");
    }

    // ── Retos ───────────────────────────────────────────────────────────────
    case "nuevo": {
      if (!enGrupo) return responder("Los retos viven en los grupos. Agregame a uno y probá ahí.");
      const esAdmin = await isGroupAdmin(deps.transport, chatId, userId);
      return handleNuevo(deps, chatId, userId, parsed.args, esAdmin);
    }

    case "abrir":
      if (!enGrupo) return responder("Los retos viven en los grupos. Agregame a uno y probá ahí.");
      return handleAbrir(deps, chatId, userId, parsed.args[0]);

    case "descartar":
      if (!enGrupo) return responder("Los retos viven en los grupos. Agregame a uno y probá ahí.");
      return handleDescartar(deps, chatId, userId, parsed.args[0]);

    case "retos":
      if (!enGrupo) return responder("Los retos viven en los grupos. Agregame a uno y probá ahí.");
      return handleRetos(deps, chatId);

    case "estado":
      if (!enGrupo) return responder("Los retos viven en los grupos. Agregame a uno y probá ahí.");
      return handleEstado(deps, chatId, parsed.args[0]);

    case "confirmar": {
      if (!enGrupo) return responder("Los retos viven en los grupos. Agregame a uno y probá ahí.");
      // La evidencia puede venir como foto con el comando en el epígrafe, o
      // respondiendo a un mensaje que la tenga.
      const tieneAdjunto =
        (message.photo?.length ?? 0) > 0 || (message.reply_to_message?.photo?.length ?? 0) > 0;
      return handleConfirmar(deps, chatId, userId, parsed.args, tieneAdjunto);
    }

    case "reembolso":
      if (!enGrupo) return responder("Los retos viven en los grupos. Agregame a uno y probá ahí.");
      return handleReembolso(deps, chatId, parsed.args[0]);

    case "historial": {
      const objetivo = message.from.username ? `@${message.from.username}` : message.from.first_name;
      return handleHistorial(deps, chatId, userId, parsed.args[0] ?? objetivo);
    }

    case "depositar":
    case "verificar":
      return responder(NO_DISPONIBLE_MINIAPP);

    case "cancelar":
      return responder(NO_DISPONIBLE_CONTRATO);

    // ── Desconocido ─────────────────────────────────────────────────────────
    default:
      // En grupo se calla: puede ser un comando de otro bot.
      if (enGrupo) return;
      return responder(`No conozco <code>/${escapeHtml(parsed.name)}</code>. Probá <code>/ayuda</code>.`);
  }
}

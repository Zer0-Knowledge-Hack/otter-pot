/**
 * Menú de comandos del bot, separado por contexto.
 *
 * Sin esto, Telegram no muestra nada al tocar «/» y el usuario tiene que adivinar
 * o escribir `/ayuda`. Registrarlo es una sola llamada y cambia por completo la
 * primera impresión de quien abre el bot.
 *
 * Se registran listas distintas por `scope`: en privado no tiene sentido ofrecer
 * `/nuevo` —los retos viven en grupos— ni al revés con `/vincular`, que pide una
 * dirección que nadie quiere pegar delante de todos.
 */

import type { TelegramTransport } from "./api";

export interface BotCommand {
  command: string;
  description: string;
}

/** Chat privado: identidad y ayuda. */
export const COMANDOS_PRIVADO: BotCommand[] = [
  { command: "start", description: "Qué es OtterPot y cómo empezar" },
  { command: "vincular", description: "Asociar tu wallet — /vincular 0x…" },
  { command: "miwallet", description: "Ver la wallet que tenés vinculada" },
  { command: "desvincular", description: "Borrar la asociación" },
  { command: "historial", description: "Tus retos jugados y ganados" },
  { command: "ayuda", description: "Lista de comandos" },
];

/** Grupos: el ciclo del reto y la configuración. */
export const COMANDOS_GRUPO: BotCommand[] = [
  { command: "nuevo", description: "Armar un reto — /nuevo [usdc] [horas]" },
  { command: "abrir", description: "Cerrar la lista y crearlo en la cadena" },
  { command: "descartar", description: "Cancelar un armado (gratis)" },
  { command: "retos", description: "Retos activos del grupo" },
  { command: "estado", description: "Pozo, depósitos y confirmaciones" },
  { command: "depositar", description: "Enlace para poner tu parte" },
  { command: "confirmar", description: "Votar al ganador — /confirmar [id] @usuario" },
  { command: "reembolso", description: "Devolver si venció el plazo" },
  { command: "historial", description: "Retos jugados y ganados" },
  { command: "config", description: "Ver la configuración del grupo" },
  { command: "set", description: "Cambiar una opción (solo admins)" },
  { command: "ayuda", description: "Lista de comandos" },
];

export interface ResultadoRegistro {
  privado: number;
  grupo: number;
}

/**
 * Registra ambos menús. Es idempotente: Telegram reemplaza la lista de cada
 * scope, así que correrlo de nuevo tras agregar un comando simplemente actualiza.
 */
export async function registrarComandos(
  transport: TelegramTransport,
): Promise<ResultadoRegistro> {
  await transport.call("setMyCommands", {
    commands: COMANDOS_PRIVADO,
    scope: { type: "all_private_chats" },
  });

  await transport.call("setMyCommands", {
    commands: COMANDOS_GRUPO,
    scope: { type: "all_group_chats" },
  });

  return { privado: COMANDOS_PRIVADO.length, grupo: COMANDOS_GRUPO.length };
}

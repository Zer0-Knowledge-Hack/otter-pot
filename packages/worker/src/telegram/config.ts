/**
 * Configuración por grupo — el modelo Rose (`BOT.md` §5).
 *
 * Cada grupo guarda su propio registro. Nada acá está hardcodeado: todo lo que
 * cambia el comportamiento del bot en un grupo se puede ajustar con `/set`.
 */

import { keys, readJson, writeJson } from "./store";
import type { KeyValueStore } from "./store";

export type Umbral = "mayoria" | "unanimidad" | "todos-menos-uno" | number;
export type Modo = "consenso" | "juez";
export type QuienCrea = "todos" | "admins";
export type NivelEvidencia = "no" | "opcional" | "obligatoria";

export interface GroupConfig {
  umbral: Umbral;
  modo: Modo;
  /** Id de Telegram del árbitro. Solo aplica con `modo: "juez"`. */
  juez: number | null;
  deposito: number;
  plazo: number;
  crear: QuienCrea;
  anuncios: boolean;
  evidencia: NivelEvidencia;
}

export const DEFAULT_CONFIG: GroupConfig = {
  umbral: "mayoria",
  modo: "consenso",
  juez: null,
  deposito: 10,
  plazo: 24,
  crear: "todos",
  anuncios: true,
  evidencia: "no",
};

export async function getConfig(store: KeyValueStore, chatId: number): Promise<GroupConfig> {
  const saved = await readJson<Partial<GroupConfig>>(store, keys.groupConfig(chatId));
  // Merge sobre los defaults: si mañana se agrega una clave, los grupos viejos
  // la reciben con su valor por defecto en vez de quedar con `undefined`.
  return { ...DEFAULT_CONFIG, ...(saved ?? {}) };
}

export async function saveConfig(
  store: KeyValueStore,
  chatId: number,
  config: GroupConfig,
): Promise<void> {
  await writeJson(store, keys.groupConfig(chatId), config);
}

export async function resetConfig(store: KeyValueStore, chatId: number): Promise<void> {
  await store.delete(keys.groupConfig(chatId));
}

// ─── Parseo de valores ───────────────────────────────────────────────────────

export interface ParseOk {
  ok: true;
  config: GroupConfig;
  /** Mensaje extra a mostrar, p. ej. cuando una opción invalida a otra. */
  aviso?: string;
}
export interface ParseError {
  ok: false;
  error: string;
}
export type ParseResult = ParseOk | ParseError;

const CLAVES_VALIDAS = [
  "umbral",
  "modo",
  "juez",
  "deposito",
  "plazo",
  "crear",
  "anuncios",
  "evidencia",
] as const;

function parseEnteroPositivo(valor: string): number | null {
  if (!/^[0-9]+$/.test(valor)) return null;
  const n = Number.parseInt(valor, 10);
  return n > 0 ? n : null;
}

/**
 * Aplica `/set <clave> <valor>` sobre la configuración actual.
 * Devuelve una copia nueva; nunca muta la recibida.
 */
export function aplicarSet(actual: GroupConfig, clave: string, valor: string): ParseResult {
  const c = clave.toLowerCase();
  const v = valor.trim().toLowerCase();

  if (!(CLAVES_VALIDAS as readonly string[]).includes(c)) {
    return {
      ok: false,
      error: `No conozco la opción «${clave}». Las válidas son: ${CLAVES_VALIDAS.join(", ")}.`,
    };
  }
  if (v === "") {
    return { ok: false, error: `Falta el valor. Ejemplo: <code>/set ${c} …</code>` };
  }

  const config: GroupConfig = { ...actual };

  switch (c) {
    case "umbral": {
      if (v === "mayoria" || v === "unanimidad" || v === "todos-menos-uno") {
        config.umbral = v;
      } else {
        const n = parseEnteroPositivo(v);
        if (n === null) {
          return {
            ok: false,
            error: "El umbral puede ser <code>mayoria</code>, <code>unanimidad</code>, <code>todos-menos-uno</code> o un número.",
          };
        }
        config.umbral = n;
      }
      // Aviso honesto: con juez el umbral no se aplica (`BOT.md` §5.1).
      return {
        ok: true,
        config,
        aviso:
          config.modo === "juez"
            ? "Ojo: este grupo está en modo <b>juez</b>, así que el umbral no se aplica. Cambialo con <code>/set modo consenso</code>."
            : undefined,
      };
    }

    case "modo": {
      if (v !== "consenso" && v !== "juez") {
        return { ok: false, error: "El modo puede ser <code>consenso</code> o <code>juez</code>." };
      }
      config.modo = v;
      return {
        ok: true,
        config,
        aviso:
          v === "juez"
            ? "En modo juez decide una sola persona: el umbral queda sin efecto. Designá al árbitro con <code>/set juez @usuario</code>."
            : undefined,
      };
    }

    case "deposito": {
      const n = parseEnteroPositivo(v);
      if (n === null) return { ok: false, error: "El depósito tiene que ser un número entero de USDC mayor a cero." };
      config.deposito = n;
      return { ok: true, config };
    }

    case "plazo": {
      const n = parseEnteroPositivo(v);
      if (n === null) return { ok: false, error: "El plazo tiene que ser un número entero de horas mayor a cero." };
      config.plazo = n;
      return { ok: true, config };
    }

    case "crear": {
      if (v !== "todos" && v !== "admins") {
        return { ok: false, error: "Puede crear retos <code>todos</code> o solo <code>admins</code>." };
      }
      config.crear = v;
      return { ok: true, config };
    }

    case "anuncios": {
      if (v !== "si" && v !== "no") {
        return { ok: false, error: "Los anuncios van en <code>si</code> o <code>no</code>." };
      }
      config.anuncios = v === "si";
      return { ok: true, config };
    }

    case "evidencia": {
      if (v !== "no" && v !== "opcional" && v !== "obligatoria") {
        return {
          ok: false,
          error: "La evidencia puede ser <code>no</code>, <code>opcional</code> u <code>obligatoria</code>.",
        };
      }
      config.evidencia = v;
      return { ok: true, config };
    }

    // `juez` se resuelve en el router: necesita traducir @usuario a un id de Telegram.
    default:
      return { ok: false, error: "Esa opción se configura desde el router." };
  }
}

/** Cuántas confirmaciones hacen falta para un reto de N participantes. */
export function calcularUmbral(umbral: Umbral, participantes: number): number {
  if (typeof umbral === "number") return Math.min(umbral, participantes);
  switch (umbral) {
    case "unanimidad":
      return participantes;
    case "todos-menos-uno":
      return Math.max(1, participantes - 1);
    case "mayoria":
    default:
      return Math.floor(participantes / 2) + 1;
  }
}

// ─── Presentación ────────────────────────────────────────────────────────────

function describirUmbral(umbral: Umbral): string {
  if (typeof umbral === "number") return `${umbral} confirmaciones`;
  if (umbral === "unanimidad") return "unanimidad";
  if (umbral === "todos-menos-uno") return "todos menos uno";
  return "mayoría simple";
}

export function renderConfig(config: GroupConfig): string {
  const juez = config.juez === null ? "sin designar" : `id ${config.juez}`;
  const lineas = [
    "🦦 <b>Configuración del grupo</b>",
    "",
    `• <b>Modo</b>: ${config.modo}`,
    config.modo === "juez" ? `• <b>Juez</b>: ${juez}` : `• <b>Umbral</b>: ${describirUmbral(config.umbral)}`,
    `• <b>Depósito</b>: ${config.deposito} USDC`,
    `• <b>Plazo</b>: ${config.plazo} h`,
    `• <b>Puede crear retos</b>: ${config.crear}`,
    `• <b>Anuncios</b>: ${config.anuncios ? "sí" : "no"}`,
    `• <b>Evidencia</b>: ${config.evidencia}`,
    "",
    "Para cambiar algo: <code>/set &lt;opción&gt; &lt;valor&gt;</code>",
  ];

  if (config.modo === "juez" && config.juez === null) {
    lineas.push("", "⚠️ Está en modo juez pero no designaste árbitro. Nadie puede resolver los retos.");
  }

  return lineas.join("\n");
}

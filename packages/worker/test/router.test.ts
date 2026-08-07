import { beforeEach, describe, expect, it } from "vitest";
import { handleUpdate, parseCommand } from "../src/telegram/router";
import { InMemoryStore } from "../src/telegram/store";
import type { TelegramTransport } from "../src/telegram/api";
import type { TelegramUpdate } from "../src/telegram/types";

/** Doble del transporte: registra las llamadas en vez de pegarle a la red. */
class TransporteFalso implements TelegramTransport {
  readonly llamadas: { method: string; payload: Record<string, unknown> }[] = [];
  /** Status que devuelve `getChatMember` — controla si el usuario es admin. */
  estadoMiembro = "administrator";

  async call(method: string, payload: Record<string, unknown>): Promise<unknown> {
    this.llamadas.push({ method, payload });
    if (method === "getChatMember") {
      return { ok: true, result: { status: this.estadoMiembro, user: { id: 1 } } };
    }
    return { ok: true };
  }

  /** Texto del último `sendMessage`. */
  get ultimoTexto(): string {
    const enviados = this.llamadas.filter((c) => c.method === "sendMessage");
    const ultimo = enviados[enviados.length - 1];
    return typeof ultimo?.payload["text"] === "string" ? (ultimo.payload["text"] as string) : "";
  }
}

const CHAT_GRUPO = -100;
const CHAT_PRIVADO = 55;
const USER = 7;

function mensaje(text: string, chatId: number, tipo: "group" | "private"): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: USER, is_bot: false, first_name: "Ana" },
      chat: { id: chatId, type: tipo },
      date: 0,
      text,
    },
  };
}

describe("parseCommand", () => {
  it("extrae el comando y los argumentos", () => {
    expect(parseCommand("/set umbral unanimidad")).toEqual({
      name: "set",
      args: ["umbral", "unanimidad"],
    });
  });

  it("tolera el sufijo del bot que Telegram agrega en grupos", () => {
    expect(parseCommand("/estado@otterpot_bot 3")).toEqual({ name: "estado", args: ["3"] });
  });

  it("ignora el texto que no es un comando", () => {
    expect(parseCommand("hola qué tal")).toBeNull();
    expect(parseCommand("  ")).toBeNull();
  });
});

describe("router — wallet", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;

  beforeEach(() => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
  });

  it("rechaza una dirección con formato inválido", async () => {
    await handleUpdate(mensaje("/vincular 0x123", CHAT_PRIVADO, "private"), { transport, store });
    expect(transport.ultimoTexto).toContain("no parece una dirección válida");
  });

  it("vincula una dirección válida y advierte que NO está verificada", async () => {
    const addr = "0x1111111111111111111111111111111111111111";
    await handleUpdate(mensaje(`/vincular ${addr}`, CHAT_PRIVADO, "private"), { transport, store });

    expect(transport.ultimoTexto).toContain("Wallet vinculada");
    // La advertencia es parte del contrato con el usuario, no un detalle de copy.
    expect(transport.ultimoTexto).toContain("Sin verificar");
  });

  it("en grupo enmascara la dirección y en privado la muestra entera", async () => {
    const addr = "0x1111111111111111111111111111111111111111";
    await handleUpdate(mensaje(`/vincular ${addr}`, CHAT_PRIVADO, "private"), { transport, store });

    await handleUpdate(mensaje("/miwallet", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("0x1111…1111");
    expect(transport.ultimoTexto).not.toContain(addr);

    await handleUpdate(mensaje("/miwallet", CHAT_PRIVADO, "private"), { transport, store });
    expect(transport.ultimoTexto).toContain(addr);
  });
});

describe("router — configuración por grupo", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;

  beforeEach(() => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
  });

  it("un no-admin no puede cambiar la configuración", async () => {
    transport.estadoMiembro = "member";
    await handleUpdate(mensaje("/set umbral unanimidad", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("Solo los admins");
  });

  it("un admin cambia el umbral y queda persistido", async () => {
    await handleUpdate(mensaje("/set umbral unanimidad", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("Actualizado");

    await handleUpdate(mensaje("/config", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("unanimidad");
  });

  it("cada grupo tiene su propia configuración", async () => {
    await handleUpdate(mensaje("/set deposito 50", CHAT_GRUPO, "group"), { transport, store });
    await handleUpdate(mensaje("/config", -200, "group"), { transport, store });
    // El otro grupo conserva el valor por defecto.
    expect(transport.ultimoTexto).toContain("10 USDC");
  });

  it("rechaza un valor inválido sin tocar lo guardado", async () => {
    await handleUpdate(mensaje("/set plazo cero", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("número entero de horas");

    await handleUpdate(mensaje("/config", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("24 h");
  });

  it("avisa que el umbral queda sin efecto al pasar a modo juez", async () => {
    await handleUpdate(mensaje("/set modo juez", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("el umbral queda sin efecto");
  });

  it("/reset vuelve a los valores por defecto", async () => {
    await handleUpdate(mensaje("/set deposito 99", CHAT_GRUPO, "group"), { transport, store });
    await handleUpdate(mensaje("/reset", CHAT_GRUPO, "group"), { transport, store });
    await handleUpdate(mensaje("/config", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("10 USDC");
  });
});

describe("router — comandos todavía no implementados", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;

  beforeEach(() => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
  });

  it("los que dependen de la Mini App lo dicen explícitamente", async () => {
    await handleUpdate(mensaje("/depositar 1", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("Mini App");
  });

  it("los que dependen del contrato lo dicen explícitamente", async () => {
    await handleUpdate(mensaje("/cancelar 1", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.ultimoTexto).toContain("versión del contrato");
  });

  it("en grupo, un comando desconocido no genera ruido", async () => {
    await handleUpdate(mensaje("/comandodeotrobot", CHAT_GRUPO, "group"), { transport, store });
    expect(transport.llamadas.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });

  it("responde siempre a los botones para que no quede el reloj girando", async () => {
    const update: TelegramUpdate = {
      update_id: 2,
      callback_query: {
        id: "cb1",
        from: { id: USER, is_bot: false, first_name: "Ana" },
        data: "sumarse:a3",
      },
    };
    await handleUpdate(update, { transport, store });
    expect(transport.llamadas.some((c) => c.method === "answerCallbackQuery")).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTelegramWebhook } from "../src/telegram";
import { InMemoryUpdateDedupe } from "../src/consensus/dedupe";
import type { UpdateDedupeGateway } from "../src/consensus/dedupe";
import { InMemoryStore } from "../src/telegram/store";
import type { Env } from "../src/index";

const env: Env = { ENVIRONMENT: "test", TELEGRAM_WEBHOOK_SECRET: "el-secreto-correcto" };

function webhookRequest(body: unknown, secret?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== undefined) headers["X-Telegram-Bot-Api-Secret-Token"] = secret;

  return new Request("http://worker.local/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("W1.1 — webhook de Telegram", () => {
  it("acepta (200) un update con el secret correcto", async () => {
    const res = await handleTelegramWebhook(webhookRequest({ update_id: 1 }, "el-secreto-correcto"), env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("rechaza (401) un update sin header de secret", async () => {
    const res = await handleTelegramWebhook(webhookRequest({ update_id: 2 }), env);
    expect(res.status).toBe(401);
  });

  it("rechaza (401) un update con secret incorrecto", async () => {
    const res = await handleTelegramWebhook(webhookRequest({ update_id: 3 }, "secret-inventado"), env);
    expect(res.status).toBe(401);
  });

  it("rechaza (401) incluso con el secret correcto si el entorno no tiene TELEGRAM_WEBHOOK_SECRET configurado", async () => {
    const envSinSecreto: Env = { ENVIRONMENT: "test" };
    const res = await handleTelegramWebhook(webhookRequest({ update_id: 4 }, "cualquier-cosa"), envSinSecreto);
    expect(res.status).toBe(401);
  });

  it("responde 400 si el secret es correcto pero el body no es JSON válido", async () => {
    const req = new Request("http://worker.local/telegram/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "el-secreto-correcto" },
      body: "esto no es json",
    });
    const res = await handleTelegramWebhook(req, env);
    expect(res.status).toBe(400);
  });
});

describe("#26 — dedupe de update_id en el webhook", () => {
  const envBot: Env = {
    ENVIRONMENT: "test",
    TELEGRAM_WEBHOOK_SECRET: "el-secreto-correcto",
    TELEGRAM_BOT_TOKEN: "123:abc",
  };
  const SECRETO = "el-secreto-correcto";

  /** Update de texto `/nutria` en un chat privado: el handler responde con un sendMessage. */
  const comando = (updateId: number, chatId: number): unknown => ({
    update_id: updateId,
    message: {
      message_id: 1,
      from: { id: 7, is_bot: false, first_name: "Ana" },
      chat: { id: chatId, type: "private" },
      date: 0,
      text: "/nutria",
    },
  });

  interface FetchEspia {
    mock: { calls: unknown[][] };
  }

  const enviados = (fetchMock: FetchEspia): number =>
    fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/sendMessage")).length;

  const stubTelegram = (): FetchEspia => {
    const fetchMock = vi.fn<unknown[], Promise<Response>>(async () => Response.json({ ok: true, result: { message_id: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("procesa un update la primera vez y lo ignora en la redelivery, siempre con 200", async () => {
    const fetchMock = stubTelegram();
    const dedupe = new InMemoryUpdateDedupe();
    const store = new InMemoryStore();

    const primera = await handleTelegramWebhook(webhookRequest(comando(100, 55), SECRETO), envBot, store, undefined, dedupe);
    const segunda = await handleTelegramWebhook(webhookRequest(comando(100, 55), SECRETO), envBot, store, undefined, dedupe);

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(enviados(fetchMock)).toBe(1);
  });

  it("el mismo update_id en dos chats distintos se procesa dos veces (dedupe por chat)", async () => {
    const fetchMock = stubTelegram();
    const dedupe = new InMemoryUpdateDedupe();
    const store = new InMemoryStore();

    await handleTelegramWebhook(webhookRequest(comando(100, 55), SECRETO), envBot, store, undefined, dedupe);
    await handleTelegramWebhook(webhookRequest(comando(100, 56), SECRETO), envBot, store, undefined, dedupe);

    expect(enviados(fetchMock)).toBe(2);
  });

  it("dos entregas concurrentes idénticas procesan una sola", async () => {
    const fetchMock = stubTelegram();
    const dedupe = new InMemoryUpdateDedupe();
    const store = new InMemoryStore();

    await Promise.all([
      handleTelegramWebhook(webhookRequest(comando(200, 55), SECRETO), envBot, store, undefined, dedupe),
      handleTelegramWebhook(webhookRequest(comando(200, 55), SECRETO), envBot, store, undefined, dedupe),
    ]);

    expect(enviados(fetchMock)).toBe(1);
  });

  it("la clave de dedupe es el chat del mensaje, o el del callback, o 'nochat'", async () => {
    stubTelegram();
    const llamadas: [string, number][] = [];
    const espia: UpdateDedupeGateway = {
      async markIfNew(chatKey, updateId) {
        llamadas.push([chatKey, updateId]);
        return true;
      },
    };
    const store = new InMemoryStore();
    const callback = {
      update_id: 2,
      callback_query: {
        id: "cb",
        from: { id: 7, is_bot: false, first_name: "Ana" },
        message: { message_id: 1, chat: { id: -100, type: "group" }, date: 0 },
        data: "sumarse:a3",
      },
    };

    await handleTelegramWebhook(webhookRequest(comando(1, 55), SECRETO), envBot, store, undefined, espia);
    await handleTelegramWebhook(webhookRequest(callback, SECRETO), envBot, store, undefined, espia);
    await handleTelegramWebhook(webhookRequest({ update_id: 3 }, SECRETO), envBot, store, undefined, espia);

    expect(llamadas).toEqual([
      ["55", 1],
      ["-100", 2],
      ["nochat", 3],
    ]);
  });

  it("si el dedupe falla, procesa igual (fail open) y deja un warn", async () => {
    const fetchMock = stubTelegram();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const roto: UpdateDedupeGateway = {
      async markIfNew() {
        throw new Error("DO unavailable");
      },
    };

    const res = await handleTelegramWebhook(webhookRequest(comando(1, 55), SECRETO), envBot, new InMemoryStore(), undefined, roto);

    expect(res.status).toBe(200);
    expect(enviados(fetchMock)).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("dedupe"), expect.anything());
  });

  it("sin gateway de dedupe procesa todo y avisa con console.warn", async () => {
    const fetchMock = stubTelegram();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new InMemoryStore();

    await handleTelegramWebhook(webhookRequest(comando(1, 55), SECRETO), envBot, store);
    await handleTelegramWebhook(webhookRequest(comando(1, 55), SECRETO), envBot, store);

    expect(enviados(fetchMock)).toBe(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("dedupe"));
  });

  it("un update con secret inválido no marca nada en el dedupe", async () => {
    stubTelegram();
    const llamadas: number[] = [];
    const espia: UpdateDedupeGateway = {
      async markIfNew(_chatKey, updateId) {
        llamadas.push(updateId);
        return true;
      },
    };

    const res = await handleTelegramWebhook(webhookRequest(comando(9, 55), "otro"), envBot, new InMemoryStore(), undefined, espia);

    expect(res.status).toBe(401);
    expect(llamadas).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import worker, { ConfirmationStore, UpdateDedupe, type Env } from "../src/index";
import { fakeNamespace } from "./helpers/durable";
import { ConfirmationStore as ConfirmationStoreShell } from "../src/durable/ConfirmationStore";
import { UpdateDedupe as UpdateDedupeShell } from "../src/durable/UpdateDedupe";

const env: Env = { ENVIRONMENT: "test" };

describe("W0.1 — scaffold del worker", () => {
  it("responde 200 en /health", async () => {
    const res = await worker.fetch(new Request("http://worker.local/health"), env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: "ok", environment: "test" });
  });

  it("responde 404 en una ruta no definida", async () => {
    const res = await worker.fetch(new Request("http://worker.local/no-existe"), env);
    expect(res.status).toBe(404);
  });
});

describe("W1.1 — ruteo del webhook de Telegram", () => {
  const envConSecret: Env = { ENVIRONMENT: "test", TELEGRAM_WEBHOOK_SECRET: "el-secreto-correcto" };

  it("POST /telegram/webhook con secret correcto llega al handler y responde 200", async () => {
    const req = new Request("http://worker.local/telegram/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "el-secreto-correcto" },
      body: JSON.stringify({ update_id: 1 }),
    });
    const res = await worker.fetch(req, envConSecret);
    expect(res.status).toBe(200);
  });

  it("GET /telegram/webhook (método no soportado) responde 404, no 200", async () => {
    const res = await worker.fetch(new Request("http://worker.local/telegram/webhook"), envConSecret);
    expect(res.status).toBe(404);
  });
});

describe("W4.1 — ruteo del endpoint de estado", () => {
  it("GET /challenges/:id/status responde 200 con un estado vacío para un reto nuevo", async () => {
    const res = await worker.fetch(new Request("http://worker.local/challenges/reto-abc/status"), env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      challengeId: "reto-abc",
      confirmationsCount: 0,
      threshold: null,
      consensusReached: false,
      phase: "collecting",
      attempt: 0,
    });
  });

  it("POST /challenges/:id/status (método no soportado) responde 404", async () => {
    const res = await worker.fetch(
      new Request("http://worker.local/challenges/reto-abc/status", { method: "POST" }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("#26 — Durable Objects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exporta las dos clases de Durable Object que declara la migración", () => {
    expect(ConfirmationStore).toBe(ConfirmationStoreShell);
    expect(UpdateDedupe).toBe(UpdateDedupeShell);
  });

  it("GET /challenges/:id/status lee del namespace CONFIRMATION_STORE cuando está bindeado", async () => {
    const namespace = fakeNamespace((state) => new ConfirmationStoreShell(state));
    const envDO: Env = { ENVIRONMENT: "test", CONFIRMATION_STORE: namespace };

    // Se siembra un voto directo en el Durable Object: el endpoint tiene que verlo.
    const stub = namespace.get(namespace.idFromName("reto-do"));
    await stub.fetch("https://do.local/", {
      method: "POST",
      body: JSON.stringify({ op: "vote", wallet: "0xAAAA", winner: "0xGanador", threshold: 3 }),
    });

    const res = await worker.fetch(new Request("http://worker.local/challenges/reto-do/status"), envDO);
    expect(await res.json()).toMatchObject({
      challengeId: "reto-do",
      confirmationsCount: 1,
      threshold: 3,
      phase: "collecting",
    });
  });

  it("sin binding usa el ledger en memoria y avisa con console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await worker.fetch(new Request("http://worker.local/challenges/reto-mem/status"), { ENVIRONMENT: "test" });

    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("CONFIRMATION_STORE"));
  });

  it("el webhook deduplica con el namespace UPDATE_DEDUPE", async () => {
    const fetchMock = vi.fn<unknown[], Promise<Response>>(async () => Response.json({ ok: true, result: { message_id: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const envDO: Env = {
      ENVIRONMENT: "test",
      TELEGRAM_WEBHOOK_SECRET: "el-secreto-correcto",
      TELEGRAM_BOT_TOKEN: "123:abc",
      UPDATE_DEDUPE: fakeNamespace((state) => new UpdateDedupeShell(state)),
    };
    const update = {
      update_id: 500,
      message: {
        message_id: 1,
        from: { id: 7, is_bot: false, first_name: "Ana" },
        chat: { id: 55, type: "private" },
        date: 0,
        text: "/nutria",
      },
    };
    const entrega = (): Request =>
      new Request("http://worker.local/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "el-secreto-correcto" },
        body: JSON.stringify(update),
      });

    expect((await worker.fetch(entrega(), envDO)).status).toBe(200);
    expect((await worker.fetch(entrega(), envDO)).status).toBe(200);

    const mensajes = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/sendMessage"));
    expect(mensajes).toHaveLength(1);
  });
});

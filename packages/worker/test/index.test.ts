import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

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

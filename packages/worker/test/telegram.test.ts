import { describe, expect, it } from "vitest";
import { handleTelegramWebhook } from "../src/telegram";
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

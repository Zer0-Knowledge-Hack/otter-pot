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

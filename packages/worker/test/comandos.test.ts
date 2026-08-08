import { describe, expect, it } from "vitest";
import { COMANDOS_GRUPO, COMANDOS_PRIVADO, registrarComandos } from "../src/telegram/comandos";
import type { TelegramTransport } from "../src/telegram/api";

class TransporteFalso implements TelegramTransport {
  readonly llamadas: { method: string; payload: Record<string, unknown> }[] = [];
  async call(method: string, payload: Record<string, unknown>): Promise<unknown> {
    this.llamadas.push({ method, payload });
    return { ok: true };
  }
}

describe("menú de comandos", () => {
  it("registra una lista por cada contexto", async () => {
    const transport = new TransporteFalso();
    const r = await registrarComandos(transport);

    expect(transport.llamadas).toHaveLength(2);
    expect(transport.llamadas.every((c) => c.method === "setMyCommands")).toBe(true);

    const scopes = transport.llamadas.map(
      (c) => (c.payload["scope"] as { type: string }).type,
    );
    expect(scopes).toEqual(["all_private_chats", "all_group_chats"]);
    expect(r).toEqual({ privado: COMANDOS_PRIVADO.length, grupo: COMANDOS_GRUPO.length });
  });

  it("no ofrece comandos de reto en privado ni de wallet en grupo", async () => {
    // Los retos viven en grupos; la dirección de wallet no se pega delante de todos.
    const privados = COMANDOS_PRIVADO.map((c) => c.command);
    const grupales = COMANDOS_GRUPO.map((c) => c.command);

    expect(privados).not.toContain("nuevo");
    expect(privados).not.toContain("confirmar");
    expect(grupales).not.toContain("vincular");
    expect(grupales).not.toContain("desvincular");
  });

  it("todos los comandos del menú existen en el router", () => {
    // Si el menú ofrece algo que el router no entiende, el usuario toca y no pasa nada.
    const enrutados = new Set([
      "start", "ayuda", "nutria", "vincular", "miwallet", "desvincular", "verificar",
      "nuevo", "abrir", "descartar", "retos", "estado", "depositar", "confirmar",
      "reembolso", "cancelar", "historial", "config", "set", "reset",
    ]);

    for (const c of [...COMANDOS_PRIVADO, ...COMANDOS_GRUPO]) {
      expect(enrutados.has(c.command), `/${c.command} está en el menú pero no en el router`).toBe(true);
    }
  });

  it("respeta los límites de Telegram: 32 chars de comando y 256 de descripción", () => {
    for (const c of [...COMANDOS_PRIVADO, ...COMANDOS_GRUPO]) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(256);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

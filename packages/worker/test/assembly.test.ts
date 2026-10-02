import { describe, expect, it } from "vitest";
import { crearArmado, sumarse, type Assembly, type Participante } from "../src/telegram/assembly";

function armado(overrides: Partial<Assembly> = {}): Assembly {
  return {
    ...crearArmado({ id: "abc", chatId: 1, creatorId: 100, deposito: 10, plazo: 24, ahora: 0 }),
    ...overrides,
  };
}

function participante(userId: number, wallet: string): Participante {
  return { userId, nombre: `user-${userId}`, wallet };
}

describe("assembly.sumarse", () => {
  it("suma un participante nuevo", () => {
    const r = sumarse(armado(), participante(1, "0xAAA"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.yaEstaba).toBe(false);
      expect(r.assembly.participantes).toHaveLength(1);
    }
  });

  it("es idempotente por userId — un doble toque no duplica ni rompe", () => {
    const conUno = armado({ participantes: [participante(1, "0xAAA")] });
    const r = sumarse(conUno, participante(1, "0xAAA"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.yaEstaba).toBe(true);
      expect(r.assembly.participantes).toHaveLength(1);
    }
  });

  it("rechaza una wallet ya declarada por OTRO usuario de Telegram (evita colapso de votos en el consenso)", () => {
    const conUno = armado({ participantes: [participante(1, "0xAAA")] });
    const r = sumarse(conUno, participante(2, "0xAAA"));

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/ya está anotada/i);
    }
  });

  it("la comparación de wallet duplicada no distingue mayúsculas/minúsculas", () => {
    const conUno = armado({ participantes: [participante(1, "0xAbCdEf")] });
    const r = sumarse(conUno, participante(2, "0xabcdef"));

    expect(r.ok).toBe(false);
  });

  it("wallets distintas de usuarios distintos se suman sin problema", () => {
    const conUno = armado({ participantes: [participante(1, "0xAAA")] });
    const r = sumarse(conUno, participante(2, "0xBBB"));

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assembly.participantes).toHaveLength(2);
    }
  });
});

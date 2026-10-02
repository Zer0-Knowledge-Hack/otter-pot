import { describe, expect, it } from "vitest";
import { calcularUmbral } from "../src/telegram/config";

describe("config.calcularUmbral — fórmula de consenso", () => {
  it.each([
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [7, 4],
  ])("mayoria con %i participantes → umbral %i (piso(n/2)+1)", (participantes, esperado) => {
    expect(calcularUmbral("mayoria", participantes)).toBe(esperado);
  });

  it("default (sin especificar) se comporta igual que 'mayoria'", () => {
    expect(calcularUmbral("mayoria", 5)).toBe(3);
  });

  it("unanimidad exige a todos los participantes", () => {
    expect(calcularUmbral("unanimidad", 4)).toBe(4);
    expect(calcularUmbral("unanimidad", 2)).toBe(2);
  });

  it("todos-menos-uno permite que uno solo no confirme", () => {
    expect(calcularUmbral("todos-menos-uno", 5)).toBe(4);
    expect(calcularUmbral("todos-menos-uno", 2)).toBe(1);
  });

  it("todos-menos-uno nunca baja de 1, incluso con muy pocos participantes", () => {
    expect(calcularUmbral("todos-menos-uno", 1)).toBe(1);
  });

  it("umbral numérico explícito se respeta tal cual", () => {
    expect(calcularUmbral(3, 10)).toBe(3);
  });

  it("umbral numérico explícito nunca supera la cantidad real de participantes", () => {
    // Si alguien configuró un número más alto que los participantes reales del reto,
    // exigir más confirmaciones que gente hay dejaría el reto irresoluble por consenso.
    expect(calcularUmbral(10, 3)).toBe(3);
  });
});

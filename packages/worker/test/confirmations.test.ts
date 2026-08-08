import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryConfirmationStore, registerConfirmation } from "../src/confirmations";

const CHALLENGE = "reto-1";
const ALICE = "0xAAAA";
const BOB = "0xBBBB";
const CARLA = "0xCCCC";
const DAVID = "0xDDDD";
const GANADOR_A = "0xGanadorA";
const GANADOR_B = "0xGanadorB";

describe("W2.1 — conteo de confirmaciones y consenso", () => {
  let store: InMemoryConfirmationStore;

  beforeEach(() => {
    store = new InMemoryConfirmationStore();
  });

  it("(a) por debajo del umbral: no dispara consenso", async () => {
    const threshold = 3;
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR_A, threshold);
    const r = await registerConfirmation(store, CHALLENGE, BOB, GANADOR_A, threshold);

    expect(r.consensusReached).toBe(false);
    expect(r.winner).toBeUndefined();
  });

  it("(b) exactamente en el umbral: dispara consenso una vez, con el ganador correcto", async () => {
    const threshold = 3;
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR_A, threshold);
    await registerConfirmation(store, CHALLENGE, BOB, GANADOR_A, threshold);
    const r = await registerConfirmation(store, CHALLENGE, CARLA, GANADOR_A, threshold);

    expect(r.consensusReached).toBe(true);
    expect(r.winner).toBe(GANADOR_A);
    expect(r.alreadyTriggered).toBe(false);
  });

  it("(c) por encima del umbral: confirmaciones adicionales NO vuelven a disparar consenso", async () => {
    const threshold = 3;
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR_A, threshold);
    await registerConfirmation(store, CHALLENGE, BOB, GANADOR_A, threshold);
    await registerConfirmation(store, CHALLENGE, CARLA, GANADOR_A, threshold); // dispara acá

    const r = await registerConfirmation(store, CHALLENGE, DAVID, GANADOR_A, threshold); // 4ta confirmación

    expect(r.consensusReached).toBe(false); // no se re-dispara
    expect(r.alreadyTriggered).toBe(true);
    expect(r.winner).toBe(GANADOR_A); // pero informa quién ya ganó
  });

  it("(d) votos divididos: ningún candidato gana falsamente por mezcla de conteos", async () => {
    const threshold = 3;
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR_A, threshold);
    await registerConfirmation(store, CHALLENGE, BOB, GANADOR_A, threshold);
    const rA = await registerConfirmation(store, CHALLENGE, CARLA, GANADOR_B, threshold);
    const rB = await registerConfirmation(store, CHALLENGE, DAVID, GANADOR_B, threshold);

    // 2 votos para GANADOR_A, 2 para GANADOR_B — ninguno llega a 3, ninguno gana.
    expect(rA.consensusReached).toBe(false);
    expect(rB.consensusReached).toBe(false);
  });

  it("rechaza explícitamente una confirmación sin wallet_address (W2.2)", async () => {
    const r1 = await registerConfirmation(store, CHALLENGE, "", GANADOR_A, 3);
    const r2 = await registerConfirmation(store, CHALLENGE, null, GANADOR_A, 3);
    const r3 = await registerConfirmation(store, CHALLENGE, undefined, GANADOR_A, 3);

    for (const r of [r1, r2, r3]) {
      expect(r.accepted).toBe(false);
      expect(r.reason).toBe("invalid-wallet");
      expect(r.consensusReached).toBe(false);
    }

    // y no debe haber quedado registrado ningún voto fantasma
    const state = await store.get(CHALLENGE);
    expect(state).toBeNull();
  });

  it("un mismo wallet que confirma dos veces reemplaza su voto, no lo duplica", async () => {
    const threshold = 2;
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR_A, threshold);
    // Alice cambia de opinión
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR_B, threshold);
    // Bob confirma a GANADOR_A — si el voto de Alice no se hubiera reemplazado, esto
    // dispararía consenso falso para GANADOR_A con "2 votos" (Alice x2 + Bob).
    const r = await registerConfirmation(store, CHALLENGE, BOB, GANADOR_A, threshold);

    expect(r.consensusReached).toBe(false); // GANADOR_A solo tiene 1 voto real (Bob)
  });

  it("el umbral queda fijado en la primera confirmación — una llamada posterior con otro threshold no lo cambia", async () => {
    // Se fija el umbral en 3 con la primera confirmación.
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR_A, 3);
    await registerConfirmation(store, CHALLENGE, BOB, GANADOR_A, 3);

    // Esta llamada pasa threshold=2 — si el código usara el parámetro en vez del persistido,
    // dispararía consenso acá con solo 2 votos, violando el umbral real fijado del reto.
    const r = await registerConfirmation(store, CHALLENGE, CARLA, GANADOR_B, 2);

    expect(r.consensusReached).toBe(false); // GANADOR_A tiene 2, GANADOR_B tiene 1 — ninguno llega a 3

    const status = await store.get(CHALLENGE);
    expect(status?.threshold).toBe(3); // el umbral persistido nunca cambió
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryConfirmationStore, registerConfirmation, type ChallengeStatus } from "../src/confirmations";
import { handleChallengeStatus } from "../src/status";

const CHALLENGE = "reto-1";
const ALICE = "0xAAAA";
const BOB = "0xBBBB";
const GANADOR = "0xGanador";

describe("W4.1 — endpoint de estado de un reto", () => {
  let store: InMemoryConfirmationStore;

  beforeEach(() => {
    store = new InMemoryConfirmationStore();
  });

  it("un reto sin ninguna confirmación devuelve estado vacío, no un error", async () => {
    const res = await handleChallengeStatus(CHALLENGE, store);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      challengeId: CHALLENGE,
      confirmationsCount: 0,
      threshold: null,
      consensusReached: false,
    });
  });

  it("refleja exactamente el estado sembrado: confirmaciones por debajo del umbral", async () => {
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR, 3);

    const res = await handleChallengeStatus(CHALLENGE, store);
    const body = await res.json();

    expect(body).toEqual({
      challengeId: CHALLENGE,
      confirmationsCount: 1,
      threshold: 3,
      consensusReached: false,
    });
  });

  it("refleja consenso alcanzado, con el ganador", async () => {
    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR, 2);
    await registerConfirmation(store, CHALLENGE, BOB, GANADOR, 2);

    const res = await handleChallengeStatus(CHALLENGE, store);
    const body = await res.json();

    expect(body).toEqual({
      challengeId: CHALLENGE,
      confirmationsCount: 2,
      threshold: 2,
      consensusReached: true,
      winner: GANADOR,
    });
  });

  it("responde 400 si no se pasa challengeId", async () => {
    const res = await handleChallengeStatus(undefined, store);
    expect(res.status).toBe(400);
  });

  it("no devuelve un estado cacheado: una consulta posterior refleja el cambio más reciente", async () => {
    const r1 = await handleChallengeStatus(CHALLENGE, store);
    const body1 = (await r1.json()) as ChallengeStatus;
    expect(body1.confirmationsCount).toBe(0);

    await registerConfirmation(store, CHALLENGE, ALICE, GANADOR, 5);

    const r2 = await handleChallengeStatus(CHALLENGE, store);
    const body2 = (await r2.json()) as ChallengeStatus;
    expect(body2.confirmationsCount).toBe(1);
  });
});

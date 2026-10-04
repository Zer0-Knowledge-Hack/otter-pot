import { beforeEach, describe, expect, it } from "vitest";
import type { ChallengeStatus } from "../src/confirmations";
import { InMemoryConsensusGateway } from "../src/consensus/gateway";
import { handleChallengeStatus } from "../src/status";

const CHALLENGE = "reto-1";
const ALICE = "0xAAAA";
const BOB = "0xBBBB";
const GANADOR = "0xGanador";
const TX = "0xfeed000000000000000000000000000000000000000000000000000000000000";

describe("W4.1 — endpoint de estado de un reto", () => {
  let store: InMemoryConsensusGateway;

  beforeEach(() => {
    store = new InMemoryConsensusGateway();
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
      phase: "collecting",
      attempt: 0,
    });
  });

  it("refleja exactamente el estado sembrado: confirmaciones por debajo del umbral", async () => {
    await store.vote(CHALLENGE, ALICE, GANADOR, 3);

    const res = await handleChallengeStatus(CHALLENGE, store);
    const body = await res.json();

    expect(body).toEqual({
      challengeId: CHALLENGE,
      confirmationsCount: 1,
      threshold: 3,
      consensusReached: false,
      phase: "collecting",
      attempt: 0,
    });
  });

  it("refleja consenso alcanzado, con el ganador y la fase", async () => {
    await store.vote(CHALLENGE, ALICE, GANADOR, 2);
    await store.vote(CHALLENGE, BOB, GANADOR, 2);

    const res = await handleChallengeStatus(CHALLENGE, store);
    const body = await res.json();

    expect(body).toEqual({
      challengeId: CHALLENGE,
      confirmationsCount: 2,
      threshold: 2,
      consensusReached: true,
      winner: GANADOR,
      phase: "consensus",
      attempt: 0,
    });
  });

  it("expone txHash cuando el reto está en submitted o confirmed", async () => {
    await store.vote(CHALLENGE, ALICE, GANADOR, 1);
    await store.beginSubmit(CHALLENGE, 1_000);
    await store.markSubmitted(CHALLENGE, 1, TX);

    const submitted = (await (await handleChallengeStatus(CHALLENGE, store)).json()) as ChallengeStatus;
    expect(submitted.phase).toBe("submitted");
    expect(submitted.txHash).toBe(TX);
    expect(submitted).not.toHaveProperty("failureReason");

    await store.markConfirmed(CHALLENGE, 1, TX);
    const confirmed = (await (await handleChallengeStatus(CHALLENGE, store)).json()) as ChallengeStatus;
    expect(confirmed.phase).toBe("confirmed");
    expect(confirmed.txHash).toBe(TX);
  });

  it("expone failureReason no vacío cuando el reto está en failed", async () => {
    await store.vote(CHALLENGE, ALICE, GANADOR, 1);
    await store.beginSubmit(CHALLENGE, 1_000);
    await store.markFailed(CHALLENGE, 1, "receipt reverted");

    const body = (await (await handleChallengeStatus(CHALLENGE, store)).json()) as ChallengeStatus;
    expect(body.phase).toBe("failed");
    expect(body.failureReason).toBe("receipt reverted");
    expect(body).not.toHaveProperty("txHash");
  });

  it("responde 400 si no se pasa challengeId", async () => {
    const res = await handleChallengeStatus(undefined, store);
    expect(res.status).toBe(400);
  });

  it("no devuelve un estado cacheado: una consulta posterior refleja el cambio más reciente", async () => {
    const r1 = await handleChallengeStatus(CHALLENGE, store);
    const body1 = (await r1.json()) as ChallengeStatus;
    expect(body1.confirmationsCount).toBe(0);

    await store.vote(CHALLENGE, ALICE, GANADOR, 5);

    const r2 = await handleChallengeStatus(CHALLENGE, store);
    const body2 = (await r2.json()) as ChallengeStatus;
    expect(body2.confirmationsCount).toBe(1);
  });
});

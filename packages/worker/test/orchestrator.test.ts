import { beforeEach, describe, expect, it } from "vitest";
import { getAddress } from "viem";
import type { Hex } from "viem";
import { InMemoryConfirmationStore } from "../src/confirmations";
import type { ConfirmResultCall, ConfirmResultWriter } from "../src/confirmTx";
import { processConfirmation } from "../src/orchestrator";
import type { ProcessConfirmationResult } from "../src/orchestrator";

const CHALLENGE = "42";
const POOL = "0x3333333333333333333333333333333333333333";
const WINNER = "0x1111111111111111111111111111111111111111";
const IMPOSTOR = "0x2222222222222222222222222222222222222222";

const ALICE = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const BOB = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const CARLA = "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";

const FAKE_TX_HASH: Hex = "0xfeed000000000000000000000000000000000000000000000000000000000000";

/** Doble de la capa de envío: registra lo que recibe y nunca toca la red ni viem. */
class RecordingWriter implements ConfirmResultWriter {
  readonly calls: ConfirmResultCall[] = [];

  async writeContract(call: ConfirmResultCall): Promise<Hex> {
    this.calls.push(call);
    return FAKE_TX_HASH;
  }
}

/** Doble que simula una tx que revierte / la red que falla: la promesa se rechaza. */
class RevertingWriter implements ConfirmResultWriter {
  readonly calls: ConfirmResultCall[] = [];

  async writeContract(call: ConfirmResultCall): Promise<Hex> {
    this.calls.push(call);
    throw new Error("execution reverted: NotOperator");
  }
}

describe("orquestación consenso → confirmResult (processConfirmation)", () => {
  let store: InMemoryConfirmationStore;

  beforeEach(() => {
    store = new InMemoryConfirmationStore();
  });

  it("confirmación sin wallet verificable → rechazada, y nunca se intenta nada de tx", async () => {
    const writer = new RecordingWriter();

    const result = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: null, proposedWinner: WINNER, threshold: 1 },
      { store, contractAddress: POOL, writer },
    );

    expect(result.outcome).toBe("rejected");
    // El acceso al motivo pasa por el discriminante: si el outcome fuera otro, esto no compila.
    expect(result.outcome === "rejected" && result.reason).toBe("invalid-wallet");
    expect(writer.calls).toHaveLength(0);
    // El voto tampoco quedó registrado: el reto sigue sin ninguna confirmación.
    expect(await store.get(CHALLENGE)).toBeNull();
  });

  it("confirmación por debajo del umbral → sin consenso todavía, y nunca se intenta nada de tx", async () => {
    const writer = new RecordingWriter();

    const first = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: ALICE, proposedWinner: WINNER, threshold: 3 },
      { store, contractAddress: POOL, writer },
    );
    const second = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: BOB, proposedWinner: WINNER, threshold: 3 },
      { store, contractAddress: POOL, writer },
    );

    expect(first.outcome).toBe("pending-consensus");
    expect(second.outcome).toBe("pending-consensus");
    if (second.outcome !== "pending-consensus") {
      throw new Error("outcome inesperado");
    }
    expect(second.status.confirmationsCount).toBe(2);
    expect(second.status.threshold).toBe(3);
    expect(second.status.consensusReached).toBe(false);
    expect(writer.calls).toHaveLength(0);
  });

  it("consenso alcanzado sin contractAddress ni writer → 'no configurado', sin excepción", async () => {
    await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: ALICE, proposedWinner: WINNER, threshold: 2 },
      { store },
    );

    const result = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: BOB, proposedWinner: WINNER, threshold: 2 },
      { store },
    );

    expect(result.outcome).toBe("not-configured");
    if (result.outcome !== "not-configured") {
      throw new Error("outcome inesperado");
    }
    expect(result.winner).toBe(WINNER);
    expect(result.missing).toEqual(["contract-address", "writer"]);
    expect(result.detail).toContain(CHALLENGE);
  });

  it("consenso alcanzado con writer pero sin contractAddress → 'no configurado', el writer no se toca", async () => {
    const writer = new RecordingWriter();

    await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: ALICE, proposedWinner: WINNER, threshold: 2 },
      { store, writer },
    );
    const result = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: BOB, proposedWinner: WINNER, threshold: 2 },
      { store, writer },
    );

    expect(result.outcome).toBe("not-configured");
    expect(result.outcome === "not-configured" && result.missing).toEqual(["contract-address"]);
    expect(writer.calls).toHaveLength(0);
  });

  it("consenso alcanzado con una fábrica de writer que lanza por falta de secrets → 'no configurado', sin excepción", async () => {
    // Reproduce el estado real de hoy: `createOperatorWriterFromEnv` lanza si faltan los secrets.
    const factory = (): ConfirmResultWriter => {
      throw new Error("confirmResult: falta el secret OPERATOR_PRIVATE_KEY (wrangler secret put)");
    };

    await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: ALICE, proposedWinner: WINNER, threshold: 2 },
      { store, contractAddress: POOL, writer: factory },
    );
    const result = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: BOB, proposedWinner: WINNER, threshold: 2 },
      { store, contractAddress: POOL, writer: factory },
    );

    expect(result.outcome).toBe("not-configured");
    if (result.outcome !== "not-configured") {
      throw new Error("outcome inesperado");
    }
    expect(result.missing).toEqual(["writer"]);
    expect(result.detail).toContain("OPERATOR_PRIVATE_KEY");
  });

  it("consenso alcanzado con un writer que resuelve OK → 'enviada', con el hash del doble", async () => {
    const writer = new RecordingWriter();

    await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: ALICE, proposedWinner: WINNER, threshold: 2 },
      { store, contractAddress: POOL, writer },
    );
    const result = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: BOB, proposedWinner: WINNER, threshold: 2 },
      { store, contractAddress: POOL, writer },
    );

    expect(result.outcome).toBe("sent");
    if (result.outcome !== "sent") {
      throw new Error("outcome inesperado");
    }
    expect(result.txHash).toBe(FAKE_TX_HASH);
    expect(result.winner).toBe(WINNER);

    expect(writer.calls).toHaveLength(1);
    const sent = writer.calls[0];
    expect(sent).toBeDefined();
    expect(sent?.address).toBe(getAddress(POOL));
    expect(sent?.functionName).toBe("confirmResult");
    expect(sent?.args).toEqual([42n, getAddress(WINNER)]);
  });

  it("consenso alcanzado con un writer cuya promesa se rechaza (tx que revierte) → 'falló', con el motivo", async () => {
    const writer = new RevertingWriter();

    await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: ALICE, proposedWinner: WINNER, threshold: 2 },
      { store, contractAddress: POOL, writer },
    );
    const result = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: BOB, proposedWinner: WINNER, threshold: 2 },
      { store, contractAddress: POOL, writer },
    );

    expect(result.outcome).toBe("send-failed");
    if (result.outcome !== "send-failed") {
      throw new Error("outcome inesperado");
    }
    expect(result.winner).toBe(WINNER);
    expect(result.reason).toContain("execution reverted");
    expect(result.cause).toBeInstanceOf(Error);
    // El writer sí se invocó: el fallo es del envío, no de la validación previa.
    expect(writer.calls).toHaveLength(1);
  });

  it("una confirmación posterior al consenso ya disparado → 'ya resuelto', sin mandar una segunda tx", async () => {
    const writer = new RecordingWriter();
    const deps = { store, contractAddress: POOL, writer };

    await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: ALICE, proposedWinner: WINNER, threshold: 2 },
      deps,
    );
    await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: BOB, proposedWinner: WINNER, threshold: 2 },
      deps,
    );
    const late = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: CARLA, proposedWinner: IMPOSTOR, threshold: 2 },
      deps,
    );

    expect(late.outcome).toBe("already-resolved");
    expect(late.outcome === "already-resolved" && late.winner).toBe(WINNER);
    // Exactamente una tx en total: el consenso dispara una sola vez, no se reintenta ni duplica.
    expect(writer.calls).toHaveLength(1);
  });

  it("el ganador que llega a la tx es el del consenso, NO el proposedWinner de la última llamada", async () => {
    const writer = new RecordingWriter();

    // Estado sembrado a mano: dos votos ya puestos a WINNER y el consenso todavía sin disparar.
    // Es la única forma de que la llamada que CRUZA el umbral proponga un ganador distinto al
    // que gana el conteo — y es justo el caso que este módulo tiene que resolver bien.
    await store.put(CHALLENGE, {
      votes: { [ALICE]: WINNER, [BOB]: WINNER },
      consensusTriggeredFor: null,
      threshold: 2,
    });

    const result = await processConfirmation(
      { challengeId: CHALLENGE, walletAddress: CARLA, proposedWinner: IMPOSTOR, threshold: 2 },
      { store, contractAddress: POOL, writer },
    );

    // Se envía igual (hay consenso), pero por WINNER: el proposedWinner de esta llamada es IMPOSTOR.
    expect(result.outcome).toBe("sent");
    if (result.outcome !== "sent") {
      throw new Error("outcome inesperado");
    }
    expect(result.winner).toBe(WINNER);

    expect(writer.calls).toHaveLength(1);
    const sent = writer.calls[0];
    expect(sent).toBeDefined();
    expect(sent?.args[1]).toBe(getAddress(WINNER));
    expect(sent?.args[1]).not.toBe(getAddress(IMPOSTOR));
  });

  it("el union cubre todos los outcomes de forma exhaustiva (chequeo de tipos, no de runtime)", () => {
    // Si alguien agrega una variante al union y no la contempla, `never` deja de compilar.
    const describeOutcome = (result: ProcessConfirmationResult): string => {
      switch (result.outcome) {
        case "rejected":
          return result.reason;
        case "pending-consensus":
          return String(result.status.confirmationsCount);
        case "already-resolved":
          return result.winner;
        case "not-configured":
          return result.missing.join(",");
        case "sent":
          return result.txHash;
        case "send-failed":
          return result.reason;
        case "inconsistent-state":
          return result.detail;
        default: {
          const exhaustive: never = result;
          return exhaustive;
        }
      }
    };

    expect(describeOutcome({ outcome: "rejected", reason: "invalid-wallet" })).toBe("invalid-wallet");
    expect(describeOutcome({ outcome: "sent", winner: WINNER, txHash: FAKE_TX_HASH })).toBe(
      FAKE_TX_HASH,
    );
  });
});

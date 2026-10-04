import { beforeEach, describe, expect, it } from "vitest";
import { encodeFunctionData, getAddress, toFunctionSelector } from "viem";
import type { Hex } from "viem";
import { InMemoryConsensusGateway } from "../src/consensus/gateway";
import {
  buildAndSendConfirmResult,
  buildConfirmResultCall,
  CHALLENGE_POOL_ABI,
  CONFIRM_RESULT_SELECTOR,
  createOperatorWriterFromEnv,
} from "../src/confirmTx";
import type { ConfirmResultCall, ConfirmResultWriter } from "../src/confirmTx";

const CHALLENGE = "42";
const POOL = "0x3333333333333333333333333333333333333333";
const WINNER = "0x1111111111111111111111111111111111111111";
const IMPOSTOR = "0x2222222222222222222222222222222222222222";

// Wallets que votan (no son argumentos de la tx, solo claves del conteo de la Fase 2).
const ALICE = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const BOB = "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const CARLA = "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";

const FAKE_TX_HASH: Hex = "0xfeed000000000000000000000000000000000000000000000000000000000000";

/** Doble de la capa de envío: registra lo que se le manda y nunca toca la red. */
class RecordingWriter implements ConfirmResultWriter {
  readonly calls: ConfirmResultCall[] = [];

  async writeContract(call: ConfirmResultCall): Promise<Hex> {
    this.calls.push(call);
    return FAKE_TX_HASH;
  }
}

describe("W3.1 — construcción de la llamada a confirmResult (capa pura, sin red)", () => {
  let store: InMemoryConsensusGateway;

  beforeEach(() => {
    store = new InMemoryConsensusGateway();
  });

  /** Deja el reto con consenso alcanzado para `winner` (umbral 3, tres votos coincidentes). */
  async function seedConsensus(winner: string): Promise<void> {
    const threshold = 3;
    await store.vote(CHALLENGE, ALICE, winner, threshold);
    await store.vote(CHALLENGE, BOB, winner, threshold);
    const r = await store.vote(CHALLENGE, CARLA, winner, threshold);
    expect(r).toEqual({ kind: "recorded", consensusTriggered: true, winner });
  }

  it("con consenso alcanzado y expectedWinner correcto: devuelve los parámetros exactos", async () => {
    await seedConsensus(WINNER);

    const call = await buildConfirmResultCall({
      reader: store,
      challengeId: CHALLENGE,
      expectedWinner: WINNER,
      contractAddress: POOL,
    });

    expect(call.address).toBe(getAddress(POOL));
    expect(call.functionName).toBe("confirmResult");
    expect(call.abi).toBe(CHALLENGE_POOL_ABI);
    expect(call.args).toEqual([42n, getAddress(WINNER)]);
    expect(call.args[0]).toBe(BigInt(CHALLENGE));
    expect(call.args[1]).toBe(getAddress(WINNER));
  });

  it("compara direcciones sin distinguir mayúsculas (son hex, el checksum no cambia la identidad)", async () => {
    await seedConsensus(WINNER.toLowerCase());

    const call = await buildConfirmResultCall({
      reader: store,
      challengeId: CHALLENGE,
      expectedWinner: WINNER.toUpperCase().replace("0X", "0x"),
      contractAddress: POOL,
    });

    expect(call.args[1]).toBe(getAddress(WINNER));
  });

  it("el selector codificado es exactamente 0x9c338d6b (detecta cualquier cambio accidental del ABI)", async () => {
    await seedConsensus(WINNER);

    const call = await buildConfirmResultCall({
      reader: store,
      challengeId: CHALLENGE,
      expectedWinner: WINNER,
      contractAddress: POOL,
    });

    const data = encodeFunctionData({
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
    });

    // Re-derivado, no copiado: si la firma cambiara en el contrato, este test cae.
    expect(CONFIRM_RESULT_SELECTOR).toBe(toFunctionSelector("confirmResult(uint256,address)"));
    expect(CONFIRM_RESULT_SELECTOR).toBe("0x9c338d6b");
    expect(data.slice(0, 10)).toBe("0x9c338d6b");
    // El ganador va codificado como último argumento, no una dirección arbitraria.
    expect(data.toLowerCase().endsWith(WINNER.slice(2).toLowerCase())).toBe(true);
  });

  it("TEST NEGATIVO: expectedWinner distinto al ganador del consenso → lanza y NO construye ninguna llamada", async () => {
    await seedConsensus(WINNER);

    // Se captura explícitamente el resultado: si la función devolviera un objeto parcial
    // en vez de lanzar, `built` quedaría definido y el test fallaría.
    let built: ConfirmResultCall | undefined;
    let captured: unknown;

    try {
      built = await buildConfirmResultCall({
        reader: store,
        challengeId: CHALLENGE,
        expectedWinner: IMPOSTOR,
        contractAddress: POOL,
      });
    } catch (error) {
      captured = error;
    }

    expect(built).toBeUndefined();
    expect(captured).toBeInstanceOf(Error);
    const message = captured instanceof Error ? captured.message : "";
    // El mensaje tiene que ser accionable: qué se intentó mandar, qué dice el consenso, y qué reto.
    expect(message).toContain("NO coincide con el ganador del consenso");
    expect(message).toContain(IMPOSTOR);
    expect(message).toContain(WINNER);
    expect(message).toContain(CHALLENGE);
  });

  it("TEST NEGATIVO: con un ganador distinto, el writer nunca se invoca (no se firma nada)", async () => {
    await seedConsensus(WINNER);
    const writer = new RecordingWriter();

    await expect(
      buildAndSendConfirmResult(
        { reader: store, challengeId: CHALLENGE, expectedWinner: IMPOSTOR, contractAddress: POOL },
        writer,
      ),
    ).rejects.toThrow(/NO coincide con el ganador del consenso/);

    expect(writer.calls).toHaveLength(0);
  });

  it("consenso todavía no alcanzado → lanza, no arma nada", async () => {
    const threshold = 3;
    await store.vote(CHALLENGE, ALICE, WINNER, threshold);
    await store.vote(CHALLENGE, BOB, WINNER, threshold);

    const writer = new RecordingWriter();
    let built: ConfirmResultCall | undefined;

    await expect(
      (async () => {
        built = await buildConfirmResultCall({
          reader: store,
          challengeId: CHALLENGE,
          expectedWinner: WINNER,
          contractAddress: POOL,
        });
      })(),
    ).rejects.toThrow(/todavía no se alcanzó/);

    expect(built).toBeUndefined();

    await expect(
      buildAndSendConfirmResult(
        { reader: store, challengeId: CHALLENGE, expectedWinner: WINNER, contractAddress: POOL },
        writer,
      ),
    ).rejects.toThrow(/todavía no se alcanzó/);
    expect(writer.calls).toHaveLength(0);
  });

  it("reto sin ninguna confirmación registrada → lanza, no arma nada", async () => {
    const writer = new RecordingWriter();
    let built: ConfirmResultCall | undefined;

    await expect(
      (async () => {
        built = await buildConfirmResultCall({
          reader: store,
          challengeId: "999",
          expectedWinner: WINNER,
          contractAddress: POOL,
        });
      })(),
    ).rejects.toThrow(/no tiene ninguna confirmación registrada/);

    expect(built).toBeUndefined();

    await expect(
      buildAndSendConfirmResult(
        { reader: store, challengeId: "999", expectedWinner: WINNER, contractAddress: POOL },
        writer,
      ),
    ).rejects.toThrow(/no tiene ninguna confirmación registrada/);
    expect(writer.calls).toHaveLength(0);
  });

  it("rechaza direcciones mal formadas antes de mirar siquiera el consenso", async () => {
    await seedConsensus(WINNER);

    await expect(
      buildConfirmResultCall({
        reader: store,
        challengeId: CHALLENGE,
        expectedWinner: "no-es-una-direccion",
        contractAddress: POOL,
      }),
    ).rejects.toThrow(/no es una dirección válida/);

    await expect(
      buildConfirmResultCall({
        reader: store,
        challengeId: CHALLENGE,
        expectedWinner: WINNER,
        contractAddress: "0x123",
      }),
    ).rejects.toThrow(/no es una dirección válida/);
  });

  it("rechaza un challengeId que no es un uint256 decimal", async () => {
    await expect(
      buildConfirmResultCall({
        reader: store,
        challengeId: "reto-1",
        expectedWinner: WINNER,
        contractAddress: POOL,
      }),
    ).rejects.toThrow(/no es un entero decimal sin signo/);
  });

  it("happy path completo: valida y recién entonces manda al writer, una sola vez", async () => {
    await seedConsensus(WINNER);
    const writer = new RecordingWriter();

    const hash = await buildAndSendConfirmResult(
      { reader: store, challengeId: CHALLENGE, expectedWinner: WINNER, contractAddress: POOL },
      writer,
    );

    expect(hash).toBe(FAKE_TX_HASH);
    expect(writer.calls).toHaveLength(1);
    const sent = writer.calls[0];
    expect(sent).toBeDefined();
    expect(sent?.address).toBe(getAddress(POOL));
    expect(sent?.functionName).toBe("confirmResult");
    expect(sent?.args).toEqual([42n, getAddress(WINNER)]);
  });

  it("sigue construyendo la llamada mientras el reto está en submitting o failed (el consenso ya está fijado)", async () => {
    await seedConsensus(WINNER);
    await store.beginSubmit(CHALLENGE, 1_000);

    const enVuelo = await buildConfirmResultCall({
      reader: store,
      challengeId: CHALLENGE,
      expectedWinner: WINNER,
      contractAddress: POOL,
    });
    expect(enVuelo.args).toEqual([42n, getAddress(WINNER)]);

    await store.markFailed(CHALLENGE, 1, "send failed");
    const reintento = await buildConfirmResultCall({
      reader: store,
      challengeId: CHALLENGE,
      expectedWinner: WINNER,
      contractAddress: POOL,
    });
    expect(reintento.args).toEqual([42n, getAddress(WINNER)]);
  });

  it("TEST NEGATIVO: en phase failed un ganador distinto al del consenso sigue abortando", async () => {
    await seedConsensus(WINNER);
    await store.beginSubmit(CHALLENGE, 1_000);
    await store.markFailed(CHALLENGE, 1, "send failed");

    await expect(
      buildConfirmResultCall({
        reader: store,
        challengeId: CHALLENGE,
        expectedWinner: IMPOSTOR,
        contractAddress: POOL,
      }),
    ).rejects.toThrow(/NO coincide con el ganador del consenso/);
  });
});

describe("W3.1 — capa de envío: la clave operadora sale de env, nunca del código", () => {
  it("lanza si falta OPERATOR_PRIVATE_KEY", () => {
    expect(() => createOperatorWriterFromEnv({ ARBITRUM_RPC_URL: "https://rpc.example" })).toThrow(
      /falta el secret OPERATOR_PRIVATE_KEY/,
    );
  });

  it("lanza si falta ARBITRUM_RPC_URL", () => {
    expect(() => createOperatorWriterFromEnv({ OPERATOR_PRIVATE_KEY: `0x${"11".repeat(32)}` })).toThrow(
      /falta el secret ARBITRUM_RPC_URL/,
    );
  });

  it("lanza si la clave operadora no tiene formato de clave privada, sin filtrarla en el mensaje", () => {
    const bogus = "clave-que-no-deberia-aparecer-en-logs";
    let message = "";
    try {
      createOperatorWriterFromEnv({
        OPERATOR_PRIVATE_KEY: bogus,
        ARBITRUM_RPC_URL: "https://rpc.example",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("formato inválido");
    expect(message).not.toContain(bogus);
  });
});

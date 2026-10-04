import { beforeEach, describe, expect, it } from "vitest";
import { LEASE_MS } from "../../src/consensus/core";
import { InMemoryConsensusGateway } from "../../src/consensus/gateway";
import { resolverEnCadena } from "../../src/telegram/resolucion";
import type { ResolucionDeps } from "../../src/telegram/resolucion";
import type { Historial, RetoRegistrado } from "../../src/telegram/retos";
import { InMemoryStore, keys, readJson } from "../../src/telegram/store";
import type { ChainClient } from "../../src/telegram/chain";
import type { Address, Hex } from "viem";

const CHAT = -100;
const ANA = { userId: 1, nombre: "@ana", wallet: "0x1111111111111111111111111111111111111111" };
const BETO = { userId: 2, nombre: "@beto", wallet: "0x2222222222222222222222222222222222222222" };
const CARLA = { userId: 3, nombre: "@carla", wallet: "0x3333333333333333333333333333333333333333" };
const TX = "0xabc" as Hex;
const T0 = 10_000_000;

const RETO: RetoRegistrado = {
  challengeId: "0",
  chatId: CHAT,
  deposito: 25,
  participantes: [ANA, BETO, CARLA],
  umbral: 2,
  txHash: "0xdef",
  createdAt: 0,
};

/** Cadena falsa con el estado on-chain, el recibo y los fallos configurables. */
class CadenaFalsa implements ChainClient {
  readonly escrituras: { fn: string; args: readonly unknown[] }[] = [];
  readonly esperas: { hash: Hex; timeoutMs: number }[] = [];
  poolAddress = "0x4444444444444444444444444444444444444444" as Address;
  estado = 1;
  recibo: "success" | "reverted" | Error = "success";
  errorAlEnviar: Error | null = null;
  errorAlLeerEstado: Error | null = null;
  /** Pausa el envío para forzar el solape de dos llamadas concurrentes. */
  demoraEnvioMs = 0;

  writer = {
    writeContract: async (call: { functionName: string; args: readonly unknown[] }): Promise<Hex> => {
      if (this.demoraEnvioMs > 0) await new Promise((r) => setTimeout(r, this.demoraEnvioMs));
      if (this.errorAlEnviar) throw this.errorAlEnviar;
      this.escrituras.push({ fn: call.functionName, args: call.args });
      return TX;
    },
  };

  async crearReto(): Promise<{ challengeId: bigint; txHash: Hex }> {
    return { challengeId: 0n, txHash: "0xdef" as Hex };
  }
  async estadoDeReto(): Promise<number> {
    if (this.errorAlLeerEstado) throw this.errorAlLeerEstado;
    return this.estado;
  }
  async esperarRecibo(hash: Hex, timeoutMs: number): Promise<"success" | "reverted"> {
    this.esperas.push({ hash, timeoutMs });
    if (this.recibo instanceof Error) throw this.recibo;
    return this.recibo;
  }
  async escalarUsdc(monto: number): Promise<bigint> {
    return BigInt(monto) * 1_000_000n;
  }
  async reembolsar(): Promise<Hex> {
    return "0xfff" as Hex;
  }
}

describe("resolverEnCadena", () => {
  let consensus: InMemoryConsensusGateway;
  let store: InMemoryStore;
  let chain: CadenaFalsa;
  let ahora: number;
  let deps: ResolucionDeps;

  const historialDe = async (userId: number): Promise<Historial | null> =>
    readJson<Historial>(store, keys.userHistory(userId));

  beforeEach(async () => {
    ahora = T0;
    consensus = new InMemoryConsensusGateway(() => ahora);
    store = new InMemoryStore();
    chain = new CadenaFalsa();
    deps = { consensus, store, chain, now: () => ahora };
    // Consenso ya alcanzado para Carla (umbral 2).
    await consensus.vote("0", ANA.wallet, CARLA.wallet, 2);
    await consensus.vote("0", BETO.wallet, CARLA.wallet, 2);
  });

  it("confirma: envía una sola tx con el ganador del consenso, espera el recibo y registra confirmed", async () => {
    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado).toEqual({
      kind: "confirmed",
      txHash: TX,
      alreadySettled: false,
      winner: CARLA.wallet,
    });
    expect(chain.escrituras).toHaveLength(1);
    expect(chain.escrituras[0]?.fn).toBe("confirmResult");
    expect(String(chain.escrituras[0]?.args[1]).toLowerCase()).toBe(CARLA.wallet.toLowerCase());
    expect(chain.esperas).toEqual([{ hash: TX, timeoutMs: 90_000 }]);
    expect(await consensus.getStatus("0")).toMatchObject({ phase: "confirmed", txHash: TX });
  });

  it("registra el historial exactamente una vez, con el ganador marcado", async () => {
    await resolverEnCadena(deps, RETO);

    expect(await historialDe(CARLA.userId)).toEqual({ jugados: 1, ganados: 1, totalMovido: 75 });
    expect(await historialDe(ANA.userId)).toEqual({ jugados: 1, ganados: 0, totalMovido: 75 });
  });

  it("no vuelve a enviar ni a escribir historial si el reto ya está confirmado", async () => {
    await resolverEnCadena(deps, RETO);
    const segundo = await resolverEnCadena(deps, RETO);

    expect(segundo).toEqual({ kind: "already_confirmed" });
    expect(chain.escrituras).toHaveLength(1);
    expect((await historialDe(CARLA.userId))?.jugados).toBe(1);
  });

  it("recibo revertido: failed sin historial; el reintento envía otra tx y recién ahí escribe historial", async () => {
    chain.recibo = "reverted";
    const fallo = await resolverEnCadena(deps, RETO);

    expect(fallo).toMatchObject({ kind: "failed", reason: "receipt_reverted" });
    expect(await consensus.getStatus("0")).toMatchObject({ phase: "failed", failureReason: "receipt_reverted" });
    expect(await historialDe(CARLA.userId)).toBeNull();

    chain.recibo = "success";
    const reintento = await resolverEnCadena(deps, RETO);

    expect(reintento).toEqual({
      kind: "confirmed",
      txHash: TX,
      alreadySettled: false,
      winner: CARLA.wallet,
    });
    expect(chain.escrituras).toHaveLength(2);
    expect(await consensus.getStatus("0")).toMatchObject({ phase: "confirmed", attempt: 2 });
    expect((await historialDe(CARLA.userId))?.jugados).toBe(1);
  });

  it("ya resuelto on-chain (status 2): no envía nada y registra confirmed sin tx", async () => {
    chain.estado = 2;
    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado).toEqual({
      kind: "confirmed",
      txHash: null,
      alreadySettled: true,
      winner: CARLA.wallet,
    });
    expect(chain.escrituras).toHaveLength(0);
    expect(chain.esperas).toHaveLength(0);
    const status = await consensus.getStatus("0");
    expect(status.phase).toBe("confirmed");
    expect(status).not.toHaveProperty("txHash");
    expect((await historialDe(CARLA.userId))?.jugados).toBe(1);
  });

  it("reembolsado on-chain (status 3): no envía nada y registra failed(refunded_onchain)", async () => {
    chain.estado = 3;
    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado).toMatchObject({ kind: "failed", reason: "refunded_onchain" });
    expect(chain.escrituras).toHaveLength(0);
    expect(await consensus.getStatus("0")).toMatchObject({ phase: "failed", failureReason: "refunded_onchain" });
    expect(await historialDe(CARLA.userId)).toBeNull();
  });

  it("falla de envío: queda failed con la razón y sin historial", async () => {
    chain.errorAlEnviar = new Error("HTTP request failed: 503");
    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado.kind).toBe("failed");
    const status = await consensus.getStatus("0");
    expect(status.phase).toBe("failed");
    expect(status.failureReason).toContain("send_failed");
    expect(status.failureReason).toContain("HTTP request failed: 503");
    expect(await historialDe(CARLA.userId)).toBeNull();
  });

  it("timeout del recibo: queda failed(receipt_timeout), la tx enviada no se pierde de vista", async () => {
    chain.recibo = new Error("Timed out while waiting for transaction");
    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado).toMatchObject({ kind: "failed", reason: "receipt_timeout" });
    expect(chain.escrituras).toHaveLength(1);
    expect((await consensus.getStatus("0")).phase).toBe("failed");
  });

  it("falla al leer el estado on-chain: aborta ANTES de enviar y deja failed", async () => {
    chain.errorAlLeerEstado = new Error("rpc down");
    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado.kind).toBe("failed");
    expect(chain.escrituras).toHaveLength(0);
    expect((await consensus.getStatus("0")).failureReason).toContain("status_read_failed");
  });

  it("dos resoluciones concurrentes: una sola tx y la otra recibe 'en curso'", async () => {
    chain.demoraEnvioMs = 20;
    const [a, b] = await Promise.all([resolverEnCadena(deps, RETO), resolverEnCadena(deps, RETO)]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["confirmed", "in_progress"]);
    expect(chain.escrituras).toHaveLength(1);
  });

  it("lease activo (holder vivo): no concede otro envío", async () => {
    await consensus.beginSubmit("0", T0); // otro holder en curso
    ahora = T0 + LEASE_MS - 1;

    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado).toEqual({ kind: "in_progress", phase: "submitting" });
    expect(chain.escrituras).toHaveLength(0);
  });

  it("recupera un submitting vencido (holder caído): nuevo intento, y el estado on-chain evita el doble pago", async () => {
    await consensus.beginSubmit("0", T0); // el holder se cae sin terminar
    ahora = T0 + LEASE_MS;
    chain.estado = 2; // la tx del holder caído sí llegó a minarse

    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado).toEqual({
      kind: "confirmed",
      txHash: null,
      alreadySettled: true,
      winner: CARLA.wallet,
    });
    expect(chain.escrituras).toHaveLength(0);
    expect(await consensus.getStatus("0")).toMatchObject({ phase: "confirmed", attempt: 2 });
  });

  it("recupera un submitted vencido (caída esperando el recibo)", async () => {
    await consensus.beginSubmit("0", T0);
    await consensus.markSubmitted("0", 1, TX);
    ahora = T0 + LEASE_MS; // markSubmitted renovó el lease desde T0

    const resultado = await resolverEnCadena(deps, RETO);

    expect(resultado).toEqual({
      kind: "confirmed",
      txHash: TX,
      alreadySettled: false,
      winner: CARLA.wallet,
    });
    expect(await consensus.getStatus("0")).toMatchObject({ phase: "confirmed", attempt: 2 });
  });

  it("sin consenso todavía: no hay nada que resolver", async () => {
    const resultado = await resolverEnCadena(deps, { ...RETO, challengeId: "1" });
    expect(resultado).toEqual({ kind: "not_ready" });
    expect(chain.escrituras).toHaveLength(0);
  });
});

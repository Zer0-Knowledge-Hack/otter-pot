import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryConsensusGateway } from "../src/consensus/gateway";
import { handleConfirmar, handleDepositar, handleHistorial, handleReembolso, handleReintentar } from "../src/telegram/retos";
import type { RetoRegistrado, RetosDeps } from "../src/telegram/retos";
import { InMemoryStore, keys, writeJson } from "../src/telegram/store";
import { saveConfig, DEFAULT_CONFIG } from "../src/telegram/config";
import type { TelegramTransport } from "../src/telegram/api";
import type { ChainClient } from "../src/telegram/chain";
import type { ChallengeStatus } from "../src/confirmations";
import type { Address, Hex } from "viem";

class TransporteFalso implements TelegramTransport {
  readonly llamadas: { method: string; payload: Record<string, unknown> }[] = [];
  readonly textos: string[] = [];
  async call(method: string, payload: Record<string, unknown>): Promise<unknown> {
    this.llamadas.push({ method, payload });
    if (method === "sendMessage" && typeof payload["text"] === "string") {
      this.textos.push(payload["text"]);
    }
    return { ok: true, result: { message_id: 1 } };
  }
  get ultimo(): string {
    return this.textos[this.textos.length - 1] ?? "";
  }
  get todo(): string {
    return this.textos.join("\n");
  }
}

/** Cadena falsa: registra las escrituras sin tocar la red. */
class CadenaFalsa implements ChainClient {
  readonly escrituras: { fn: string; args: readonly unknown[] }[] = [];
  poolAddress = "0x3333333333333333333333333333333333333333" as Address;

  writer = {
    writeContract: async (call: { functionName: string; args: readonly unknown[] }): Promise<Hex> => {
      this.escrituras.push({ fn: call.functionName, args: call.args });
      return "0xabc" as Hex;
    },
  };

  async crearReto(): Promise<{ challengeId: bigint; txHash: Hex }> {
    return { challengeId: 0n, txHash: "0xdef" as Hex };
  }
  estado = 1;
  recibo: "success" | "reverted" = "success";
  async estadoDeReto(): Promise<number> {
    return this.estado;
  }
  async esperarRecibo(): Promise<"success" | "reverted"> {
    return this.recibo;
  }
  async escalarUsdc(monto: number): Promise<bigint> {
    return BigInt(monto) * 1_000_000n;
  }
  async reembolsar(): Promise<Hex> {
    return "0xfff" as Hex;
  }
}

const CHAT = -100;
const ANA = { userId: 1, nombre: "@ana", wallet: "0x1111111111111111111111111111111111111111" };
const BETO = { userId: 2, nombre: "@beto", wallet: "0x2222222222222222222222222222222222222222" };
const CARLA = { userId: 3, nombre: "@carla", wallet: "0x3333333333333333333333333333333333333333" };

const RETO: RetoRegistrado = {
  challengeId: "0",
  chatId: CHAT,
  deposito: 25,
  participantes: [ANA, BETO, CARLA],
  umbral: 2,
  txHash: "0xdef",
  createdAt: 0,
};

describe("/confirmar", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;
  let chain: CadenaFalsa;
  let deps: RetosDeps;

  beforeEach(async () => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
    chain = new CadenaFalsa();
    deps = { transport, store, chain, consensus: new InMemoryConsensusGateway() };
    await writeJson(store, keys.challenge(CHAT, "0"), RETO);
  });

  it("rechaza a quien no participa del reto", async () => {
    await handleConfirmar(deps, CHAT, 99, ["0", "@ana"], false);
    expect(transport.ultimo).toContain("no te incluye");
    expect(chain.escrituras).toHaveLength(0);
  });

  it("rechaza un ganador que no es participante", async () => {
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@fulano"], false);
    expect(transport.ultimo).toContain("No encuentro a");
    expect(chain.escrituras).toHaveLength(0);
  });

  it("registra el voto sin escribir en la cadena si falta consenso", async () => {
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    expect(transport.ultimo).toContain("Voto registrado");
    expect(chain.escrituras).toHaveLength(0);
  });

  it("al alcanzar el umbral resuelve en la cadena con el ganador del consenso", async () => {
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);

    expect(chain.escrituras).toHaveLength(1);
    const escritura = chain.escrituras[0];
    expect(escritura?.fn).toBe("confirmResult");
    // El segundo argumento es el ganador: tiene que ser la wallet de Carla, no otra.
    expect(String(escritura?.args[1]).toLowerCase()).toBe(CARLA.wallet.toLowerCase());
    expect(transport.todo).toContain("resuelto");
  });

  it("votos divididos no alcanzan el umbral y no escriben nada", async () => {
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@ana"], false);
    expect(chain.escrituras).toHaveLength(0);
  });

  it("con evidencia obligatoria, rechaza el voto sin adjunto", async () => {
    await saveConfig(store, CHAT, { ...DEFAULT_CONFIG, evidencia: "obligatoria" });
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    expect(transport.ultimo).toContain("exige adjuntar prueba");
    expect(chain.escrituras).toHaveLength(0);
  });

  it("con evidencia obligatoria, acepta el voto con adjunto", async () => {
    await saveConfig(store, CHAT, { ...DEFAULT_CONFIG, evidencia: "obligatoria" });
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], true);
    expect(transport.ultimo).toContain("Voto registrado");
  });

  it("no vuelve a resolver un reto ya resuelto", async () => {
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, CARLA.userId, ["0", "@carla"], false);

    expect(chain.escrituras).toHaveLength(1);
    expect(transport.ultimo).toContain("ya se resolvió");
  });
});

describe("/historial", () => {
  it("informa cuando el usuario todavía no jugó nada", async () => {
    const transport = new TransporteFalso();
    const deps: RetosDeps = { transport, store: new InMemoryStore() };
    await handleHistorial(deps, CHAT, ANA.userId, "@ana");
    expect(transport.ultimo).toContain("todavía no jugó");
  });

  it("acumula jugados, ganados y total movido al resolverse un reto", async () => {
    const transport = new TransporteFalso();
    const store = new InMemoryStore();
    const deps: RetosDeps = {
      transport,
      store,
      chain: new CadenaFalsa(),
      consensus: new InMemoryConsensusGateway(),
    };
    await writeJson(store, keys.challenge(CHAT, "0"), RETO);

    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);

    await handleHistorial(deps, CHAT, CARLA.userId, "@carla");
    expect(transport.ultimo).toContain("Jugados: <b>1</b>");
    expect(transport.ultimo).toContain("Ganados: <b>1</b> (100%)");
    expect(transport.ultimo).toContain("75 USDC");

    await handleHistorial(deps, CHAT, ANA.userId, "@ana");
    expect(transport.ultimo).toContain("Ganados: <b>0</b> (0%)");
  });
});

describe("/depositar", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;
  let deps: RetosDeps;

  beforeEach(async () => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
    deps = { transport, store };
    await writeJson(store, keys.challenge(CHAT, "0"), RETO);
  });

  it("rechaza a quien no participa del reto", async () => {
    await handleDepositar(deps, CHAT, 99, "0", "https://app.otterpot.dev");
    expect(transport.ultimo).toContain("no te incluye");
  });

  it("arma el enlace con el reto y el monto en la query", async () => {
    await handleDepositar(deps, CHAT, ANA.userId, "0", "https://app.otterpot.dev/");
    const conBoton = transport.llamadas.find(
      (c) => c.method === "sendMessage" && c.payload["reply_markup"] !== undefined,
    );
    const markup = conBoton?.payload["reply_markup"] as {
      inline_keyboard: { text: string; url?: string }[][];
    };
    const url = markup.inline_keyboard[0]?.[0]?.url ?? "";
    // La barra final de la base no debe duplicarse.
    expect(url).toBe("https://app.otterpot.dev/depositar?reto=0&monto=25");
  });
});

// ─── Custom errors del contrato, tal como los ve el usuario ──────────────────

/** Error con la forma que arma viem cuando el contrato revierte con un custom error. */
function revertDelContrato(errorName: string): Error {
  const interno = new Error(`The contract function reverted.\n\nError: ${errorName}()`) as Error & {
    name: string;
    data: { errorName: string };
  };
  interno.name = "ContractFunctionRevertedError";
  interno.data = { errorName };

  const externo = new Error("The contract function reverted.") as Error & { cause?: unknown };
  externo.name = "ContractFunctionExecutionError";
  externo.cause = interno;
  return externo;
}

describe("custom errors del ChallengePool en los mensajes del bot", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;

  beforeEach(async () => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
    await writeJson(store, keys.challenge(CHAT, "0"), RETO);
  });

  it("/reembolso antes del plazo explica el plazo en vez de volcar el error de viem", async () => {
    const chain = new CadenaFalsa();
    chain.reembolsar = async (): Promise<Hex> => {
      throw revertDelContrato("DeadlineNotReached");
    };
    const deps: RetosDeps = { transport, store, chain, consensus: new InMemoryConsensusGateway() };

    await handleReembolso(deps, CHAT, "0");

    expect(transport.ultimo).toContain("plazo");
    expect(transport.ultimo).not.toContain("DeadlineNotReached");
    expect(transport.ultimo).not.toContain("contract function");
  });

  it("un reto con una wallet repetida explica el duplicado", async () => {
    const chain = new CadenaFalsa();
    chain.reembolsar = async (): Promise<Hex> => {
      throw revertDelContrato("DuplicateParticipant");
    };
    const deps: RetosDeps = { transport, store, chain, consensus: new InMemoryConsensusGateway() };

    await handleReembolso(deps, CHAT, "0");

    expect(transport.ultimo).toMatch(/repetid/i);
    expect(transport.ultimo).not.toContain("DuplicateParticipant");
  });

  it("un error de red se muestra tal cual, sin traducción inventada", async () => {
    const chain = new CadenaFalsa();
    chain.reembolsar = async (): Promise<Hex> => {
      throw new Error("HTTP request failed: 503");
    };
    const deps: RetosDeps = { transport, store, chain, consensus: new InMemoryConsensusGateway() };

    await handleReembolso(deps, CHAT, "0");

    expect(transport.ultimo).toContain("HTTP request failed: 503");
  });
});

// ─── Ciclo de vida de la tx: /confirmar y /reintentar ────────────────────────

describe("/confirmar — ciclo de vida de la tx", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;
  let chain: CadenaFalsa;
  let consensus: InMemoryConsensusGateway;
  let deps: RetosDeps;

  const status = (): Promise<ChallengeStatus> => consensus.getStatus("0");

  beforeEach(async () => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
    chain = new CadenaFalsa();
    consensus = new InMemoryConsensusGateway();
    deps = { transport, store, chain, consensus };
    await writeJson(store, keys.challenge(CHAT, "0"), RETO);
  });

  it("el recibo revertido deja el reto en failed y avisa cómo reintentar, sin escribir historial", async () => {
    chain.recibo = "reverted";
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);

    expect(transport.ultimo).toContain("No pude resolver");
    expect(transport.ultimo).toContain("/reintentar 0");
    expect(await status()).toMatchObject({ phase: "failed", failureReason: "receipt_reverted" });

    await handleHistorial(deps, CHAT, CARLA.userId, "@carla");
    expect(transport.ultimo).toContain("todavía no jugó");
  });

  it("un /confirmar mientras la tx está en vuelo responde 'en curso' y no envía otra", async () => {
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    // Consenso alcanzado por otro lado y un holder ya tiene el derecho de envío.
    await consensus.vote("0", BETO.wallet, CARLA.wallet, 2);
    await consensus.beginSubmit("0", Date.now());

    await handleConfirmar(deps, CHAT, CARLA.userId, ["0", "@carla"], false);

    expect(transport.ultimo).toContain("en curso");
    expect(chain.escrituras).toHaveLength(0);
  });

  it("un /confirmar de un participante con el reto en failed reintenta y resuelve", async () => {
    chain.recibo = "reverted";
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);
    expect((await status()).phase).toBe("failed");

    chain.recibo = "success";
    await handleConfirmar(deps, CHAT, CARLA.userId, ["0", "@carla"], false);

    expect(chain.escrituras).toHaveLength(2);
    expect(transport.ultimo).toContain("resuelto");
    expect((await status()).phase).toBe("confirmed");
  });

  it("si el reto ya estaba resuelto on-chain, lo registra sin enviar tx y lo dice", async () => {
    chain.estado = 2;
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);

    expect(chain.escrituras).toHaveLength(0);
    expect(transport.ultimo).toContain("ya estaba resuelto");
    expect((await status()).phase).toBe("confirmed");
  });
});

describe("/reintentar", () => {
  let transport: TransporteFalso;
  let store: InMemoryStore;
  let chain: CadenaFalsa;
  let consensus: InMemoryConsensusGateway;
  let deps: RetosDeps;

  /** Deja el reto en failed con consenso para Carla. */
  async function dejarEnFailed(): Promise<void> {
    chain.recibo = "reverted";
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);
    chain.recibo = "success";
  }

  beforeEach(async () => {
    transport = new TransporteFalso();
    store = new InMemoryStore();
    chain = new CadenaFalsa();
    consensus = new InMemoryConsensusGateway();
    deps = { transport, store, chain, consensus };
    await writeJson(store, keys.challenge(CHAT, "0"), RETO);
  });

  it("cualquier participante reintenta con el ganador del consenso, sin mención", async () => {
    await dejarEnFailed();

    // Carla no es quien reintenta por mención: basta con participar, el ganador sale del consenso.
    await handleReintentar(deps, CHAT, CARLA.userId, "0");

    expect(chain.escrituras).toHaveLength(2);
    expect(String(chain.escrituras[1]?.args[1]).toLowerCase()).toBe(CARLA.wallet.toLowerCase());
    expect(transport.ultimo).toContain("resuelto");
    expect(transport.ultimo).toContain("@carla");
    expect((await consensus.getStatus("0")).phase).toBe("confirmed");
  });

  it("rechaza a quien no participa y deja el reto en failed", async () => {
    await dejarEnFailed();
    const escrituras = chain.escrituras.length;

    await handleReintentar(deps, CHAT, 99, "0");

    expect(transport.ultimo).toContain("no te incluye");
    expect(chain.escrituras).toHaveLength(escrituras);
    expect((await consensus.getStatus("0")).phase).toBe("failed");
  });

  it("sin consenso todavía no hay nada que reintentar", async () => {
    await handleReintentar(deps, CHAT, ANA.userId, "0");
    expect(transport.ultimo).toContain("Todavía no hay consenso");
    expect(chain.escrituras).toHaveLength(0);
  });

  it("con el reto ya confirmado avisa que ya se resolvió y no envía otra tx", async () => {
    await handleConfirmar(deps, CHAT, ANA.userId, ["0", "@carla"], false);
    await handleConfirmar(deps, CHAT, BETO.userId, ["0", "@carla"], false);

    await handleReintentar(deps, CHAT, ANA.userId, "0");

    expect(transport.ultimo).toContain("ya se resolvió");
    expect(chain.escrituras).toHaveLength(1);
  });

  it("con un envío en vuelo responde 'en curso'", async () => {
    await consensus.vote("0", ANA.wallet, CARLA.wallet, 1);
    await consensus.beginSubmit("0", Date.now());

    await handleReintentar(deps, CHAT, ANA.userId, "0");

    expect(transport.ultimo).toContain("en curso");
    expect(chain.escrituras).toHaveLength(0);
  });

  it("pide el id y avisa si el reto no existe", async () => {
    await handleReintentar(deps, CHAT, ANA.userId, undefined);
    expect(transport.ultimo).toContain("Faltó el id");

    await handleReintentar(deps, CHAT, ANA.userId, "77");
    expect(transport.ultimo).toContain("No encuentro el reto");
  });

  it("avisa si no hay cadena o ledger configurado", async () => {
    await handleReintentar({ transport, store }, CHAT, ANA.userId, "0");
    expect(transport.ultimo).toContain("No tengo");
  });
});

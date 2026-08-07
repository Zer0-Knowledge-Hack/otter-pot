import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryConfirmationStore } from "../src/confirmations";
import { handleConfirmar, handleDepositar, handleHistorial } from "../src/telegram/retos";
import type { RetoRegistrado, RetosDeps } from "../src/telegram/retos";
import { InMemoryStore, keys, writeJson } from "../src/telegram/store";
import { saveConfig, DEFAULT_CONFIG } from "../src/telegram/config";
import type { TelegramTransport } from "../src/telegram/api";
import type { ChainClient } from "../src/telegram/chain";
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
  async estadoDeReto(): Promise<number> {
    return 1;
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
    deps = { transport, store, chain, confirmations: new InMemoryConfirmationStore() };
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
      confirmations: new InMemoryConfirmationStore(),
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

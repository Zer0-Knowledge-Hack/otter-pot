import { describe, expect, it } from "vitest";
import { arbitrumSepolia } from "viem/chains";
import {
  arbitrumNitroLocal,
  arcTestnet,
  ColaDeTransacciones,
  configDesdeEnv,
  crearChainClient,
  resolverCadena,
} from "../src/telegram/chain";
import type { PeticionDeEscritura, PuertoDeCadena, ReciboDeTx } from "../src/telegram/chain";
import { EnvioFallidoError, RetoNoResueltoError, TransaccionRevertidaError } from "../src/telegram/errores";
import type { Address, Hex } from "viem";

const CLAVE = `0x${"1".repeat(64)}`;
const POOL = "0x3953ecD3f1797FD18b22a151fEF20C3f5Ae0aD0B";
const USDC = "0x3600000000000000000000000000000000000000";

describe("resolución de cadena", () => {
  it("resuelve Arc testnet por su id", () => {
    const chain = resolverCadena(5042002);
    expect(chain.id).toBe(5042002);
    expect(chain).toBe(arcTestnet);
  });

  it("Arc testnet apunta al RPC y al explorador del deployment", () => {
    expect(arcTestnet.rpcUrls.default.http[0]).toBe("https://rpc.testnet.arc.io");
    expect(arcTestnet.blockExplorers?.default.url).toBe("https://testnet.arcscan.app");
  });

  /**
   * Contraintuitivo a propósito: en Arc la interfaz NATIVA es de 18 decimales
   * mientras que la ERC-20 es de 6, sobre un mismo saldo. `nativeCurrency`
   * describe la interfaz nativa, así que 18 es el valor correcto acá.
   */
  it("la moneda nativa de Arc es USDC con 18 decimales (interfaz nativa)", () => {
    expect(arcTestnet.nativeCurrency).toEqual({ name: "USDC", symbol: "USDC", decimals: 18 });
  });

  it("sigue resolviendo Arbitrum Sepolia y el devnode local", () => {
    expect(resolverCadena(arbitrumSepolia.id)).toBe(arbitrumSepolia);
    expect(resolverCadena(arbitrumNitroLocal.id)).toBe(arbitrumNitroLocal);
  });

  it("un CHAIN_ID desconocido lanza y el mensaje lista Arc entre las opciones", () => {
    expect(() => resolverCadena(999)).toThrow(/5042002/);
    expect(() => resolverCadena(999)).toThrow(/Arc/);
  });

  it("un CHAIN_ID ausente lanza en vez de caer a una cadena por defecto", () => {
    expect(() => resolverCadena(undefined)).toThrow(/CHAIN_ID/);
  });

  it("configDesdeEnv arma la config de Arc a partir del entorno", () => {
    const config = configDesdeEnv({
      CHAIN_ID: "5042002",
      CHAIN_RPC_URL: "https://rpc.testnet.arc.io",
      CHALLENGE_POOL_ADDRESS: POOL,
      USDC_ADDRESS: USDC,
      OPERATOR_PRIVATE_KEY: CLAVE,
    });

    expect(config.chain).toBe(arcTestnet);
    expect(config.poolAddress).toBe(POOL);
    expect(config.usdcAddress).toBe(USDC);
  });
});

describe("configDesdeEnv: validacion por variable", () => {
  const valido = {
    CHAIN_ID: "421614",
    CHAIN_RPC_URL: "https://sepolia-rollup.arbitrum.io/rpc",
    CHALLENGE_POOL_ADDRESS: POOL,
    USDC_ADDRESS: USDC,
    OPERATOR_PRIVATE_KEY: CLAVE,
  };

  it("acepta una configuracion valida de Arbitrum Sepolia", () => {
    const config = configDesdeEnv(valido);
    expect(config.chain).toBe(arbitrumSepolia);
    expect(config.rpcUrl).toBe(valido.CHAIN_RPC_URL);
  });

  it("rechaza un CHAIN_RPC_URL que no es una URL", () => {
    expect(() => configDesdeEnv({ ...valido, CHAIN_RPC_URL: "not-a-url" })).toThrow(/CHAIN_RPC_URL.*URL/);
  });

  it("rechaza un CHAIN_RPC_URL con protocolo distinto de http o https", () => {
    expect(() => configDesdeEnv({ ...valido, CHAIN_RPC_URL: "ftp://host" })).toThrow(/CHAIN_RPC_URL.*http/);
  });

  it("acepta http para el devnode local", () => {
    expect(() => configDesdeEnv({ ...valido, CHAIN_RPC_URL: "http://127.0.0.1:8547" })).not.toThrow();
  });

  it.each(["CHAIN_RPC_URL", "CHALLENGE_POOL_ADDRESS", "USDC_ADDRESS", "OPERATOR_PRIVATE_KEY"] as const)(
    "nombra %s cuando falta",
    (variable) => {
      const env: Record<string, string | undefined> = { ...valido, [variable]: undefined };
      expect(() => configDesdeEnv(env)).toThrow(new RegExp(`falta ${variable}`));
    },
  );

  it("nombra CHAIN_ID cuando falta", () => {
    expect(() => configDesdeEnv({ ...valido, CHAIN_ID: undefined })).toThrow(/CHAIN_ID/);
  });

  it.each(["CHALLENGE_POOL_ADDRESS", "USDC_ADDRESS"] as const)("nombra %s cuando es invalida", (variable) => {
    expect(() => configDesdeEnv({ ...valido, [variable]: "0x1234" })).toThrow(new RegExp(variable));
  });

  it("nunca repite la clave privada invalida en el error", () => {
    const invalida = "clave-secreta-que-no-debe-aparecer";
    let mensaje = "";
    try {
      configDesdeEnv({ ...valido, OPERATOR_PRIVATE_KEY: invalida });
    } catch (error) {
      mensaje = error instanceof Error ? error.message : "";
    }
    expect(mensaje).toContain("OPERATOR_PRIVATE_KEY");
    expect(mensaje).not.toContain(invalida);
  });
});


describe("ColaDeTransacciones", () => {
  it("ejecuta las tareas de a una, en orden de llegada", async () => {
    const cola = new ColaDeTransacciones();
    const eventos: string[] = [];
    const tarea = (nombre: string, ms: number) => async (): Promise<string> => {
      eventos.push(`inicio ${nombre}`);
      await new Promise((r) => setTimeout(r, ms));
      eventos.push(`fin ${nombre}`);
      return nombre;
    };

    const resultados = await Promise.all([cola.ejecutar(tarea("a", 20)), cola.ejecutar(tarea("b", 1))]);

    expect(resultados).toEqual(["a", "b"]);
    expect(eventos).toEqual(["inicio a", "fin a", "inicio b", "fin b"]);
  });

  it("una tarea que falla no bloquea a la siguiente", async () => {
    const cola = new ColaDeTransacciones();
    const primera = cola.ejecutar(async () => {
      throw new Error("boom");
    });
    const segunda = cola.ejecutar(async () => "ok");

    await expect(primera).rejects.toThrow("boom");
    await expect(segunda).resolves.toBe("ok");
  });
});

// ─── Cliente con un puerto de cadena falso ───────────────────────────────────

const GANADOR = "0x1111111111111111111111111111111111111111" as Address;
const HASH_A = "0xaaaa000000000000000000000000000000000000000000000000000000000000" as Hex;
const HASH_B = "0xbbbb000000000000000000000000000000000000000000000000000000000000" as Hex;

/** Puerto falso: registra el orden de las llamadas y entrega nonces distintos por envío. */
class PuertoFalso implements PuertoDeCadena {
  readonly eventos: string[] = [];
  readonly peticiones: PeticionDeEscritura[] = [];
  readonly timeouts: number[] = [];
  nonce = 0;
  hashes: Hex[] = [HASH_A, HASH_B];
  estadoDeRetoLeido = 2;
  statusDeRecibo: ReciboDeTx["status"] = "success";
  errorAlEnviar: Error | null = null;
  errorAlEsperar: Error | null = null;
  demoraRecibo = 0;
  decimales = 6;
  lecturasDeDecimales = 0;
  idCreado: bigint | undefined = 9n;

  async enviar(peticion: PeticionDeEscritura): Promise<Hex> {
    if (this.errorAlEnviar) {
      const error = this.errorAlEnviar;
      this.errorAlEnviar = null;
      throw error;
    }
    this.peticiones.push(peticion);
    const hash = this.hashes[this.nonce] ?? HASH_B;
    this.nonce += 1;
    this.eventos.push(`enviar ${peticion.functionName} nonce=${this.nonce - 1}`);
    return hash;
  }
  async esperarRecibo(hash: Hex, timeoutMs: number): Promise<ReciboDeTx> {
    this.timeouts.push(timeoutMs);
    if (this.errorAlEsperar) throw this.errorAlEsperar;
    await new Promise((r) => setTimeout(r, this.demoraRecibo));
    this.eventos.push(`recibo ${hash.slice(0, 6)}`);
    return { status: this.statusDeRecibo, blockHash: HASH_A };
  }
  async leerEstado(): Promise<number> {
    this.eventos.push("leerEstado");
    return this.estadoDeRetoLeido;
  }
  async leerDecimales(): Promise<number> {
    this.lecturasDeDecimales += 1;
    return this.decimales;
  }
  async idDeRetoCreado(): Promise<bigint | undefined> {
    return this.idCreado;
  }
}

const ENV_VALIDO = {
  CHAIN_ID: "421614",
  CHAIN_RPC_URL: "https://sepolia-rollup.arbitrum.io/rpc",
  CHALLENGE_POOL_ADDRESS: POOL,
  USDC_ADDRESS: USDC,
  OPERATOR_PRIVATE_KEY: CLAVE,
};

function clienteCon(puerto: PuertoFalso, cola = new ColaDeTransacciones()) {
  return crearChainClient(configDesdeEnv(ENV_VALIDO), { puerto, cola });
}

describe("confirmarResultado: recibo verificado", () => {
  it("exito: espera el recibo, relee el estado y devuelve el hash", async () => {
    const puerto = new PuertoFalso();
    const hash = await clienteCon(puerto).confirmarResultado(7n, GANADOR);

    expect(hash).toBe(HASH_A);
    expect(puerto.peticiones[0]).toEqual({ functionName: "confirmResult", args: [7n, GANADOR] });
    expect(puerto.eventos).toEqual(["enviar confirmResult nonce=0", "recibo 0xaaaa", "leerEstado"]);
    expect(puerto.timeouts).toEqual([60_000]);
  });

  it("avisa el hash apenas se transmite, antes del recibo", async () => {
    const puerto = new PuertoFalso();
    const avisos: string[] = [];
    await clienteCon(puerto).confirmarResultado(7n, GANADOR, {
      alEnviar: async (hash) => {
        avisos.push(`${hash.slice(0, 6)} tras ${puerto.eventos.length} eventos`);
      },
    });
    expect(avisos).toEqual(["0xaaaa tras 1 eventos"]);
  });

  it("recibo reverted: lanza TransaccionRevertidaError sin leer el estado", async () => {
    const puerto = new PuertoFalso();
    puerto.statusDeRecibo = "reverted";

    const error = await clienteCon(puerto)
      .confirmarResultado(7n, GANADOR)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransaccionRevertidaError);
    expect((error as TransaccionRevertidaError).txHash).toBe(HASH_A);
    expect(puerto.eventos).not.toContain("leerEstado");
  });

  it("recibo success pero estado distinto de Resuelto: lanza RetoNoResueltoError con el estado", async () => {
    const puerto = new PuertoFalso();
    puerto.estadoDeRetoLeido = 1;

    const error = await clienteCon(puerto)
      .confirmarResultado(7n, GANADOR)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RetoNoResueltoError);
    expect((error as RetoNoResueltoError).estadoObservado).toBe(1);
    expect((error as RetoNoResueltoError).challengeId).toBe(7n);
  });

  it("falla al enviar: lanza EnvioFallidoError y nunca informa exito", async () => {
    const puerto = new PuertoFalso();
    puerto.errorAlEnviar = new Error("rpc caido");

    const error = await clienteCon(puerto)
      .confirmarResultado(7n, GANADOR)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EnvioFallidoError);
    expect((error as EnvioFallidoError).cause).toMatchObject({ message: "rpc caido" });
  });

  it("falla o vence la espera del recibo: lanza EnvioFallidoError", async () => {
    const puerto = new PuertoFalso();
    puerto.errorAlEsperar = new Error("timeout");

    await expect(clienteCon(puerto).confirmarResultado(7n, GANADOR)).rejects.toBeInstanceOf(EnvioFallidoError);
  });

  it("el segundo envio arranca recien tras el recibo del primero, con otro nonce", async () => {
    const puerto = new PuertoFalso();
    puerto.demoraRecibo = 15;
    const cliente = clienteCon(puerto);

    await Promise.all([cliente.confirmarResultado(1n, GANADOR), cliente.confirmarResultado(2n, GANADOR)]);

    expect(puerto.eventos).toEqual([
      "enviar confirmResult nonce=0",
      "recibo 0xaaaa",
      "leerEstado",
      "enviar confirmResult nonce=1",
      "recibo 0xbbbb",
      "leerEstado",
    ]);
  });

  it("una resolucion fallida no bloquea la siguiente", async () => {
    const puerto = new PuertoFalso();
    puerto.errorAlEnviar = new Error("rpc caido");
    const cliente = clienteCon(puerto);

    const primera = cliente.confirmarResultado(1n, GANADOR);
    const segunda = cliente.confirmarResultado(2n, GANADOR);
    await expect(primera).rejects.toBeInstanceOf(EnvioFallidoError);
    await expect(segunda).resolves.toBe(HASH_A);
  });
});

describe("crearReto y reembolsar: recibo verificado", () => {
  it("crearReto devuelve el id del evento cuando el recibo es success", async () => {
    const puerto = new PuertoFalso();
    const resultado = await clienteCon(puerto).crearReto(25_000_000n, 100n, [GANADOR]);

    expect(resultado).toEqual({ challengeId: 9n, txHash: HASH_A });
    expect(puerto.peticiones[0]?.functionName).toBe("createChallenge");
  });

  it("crearReto con recibo reverted lanza TransaccionRevertidaError", async () => {
    const puerto = new PuertoFalso();
    puerto.statusDeRecibo = "reverted";
    await expect(clienteCon(puerto).crearReto(1n, 1n, [GANADOR])).rejects.toBeInstanceOf(TransaccionRevertidaError);
  });

  it("crearReto sin evento ChallengeCreated lanza en vez de inventar un id", async () => {
    const puerto = new PuertoFalso();
    puerto.idCreado = undefined;
    await expect(clienteCon(puerto).crearReto(1n, 1n, [GANADOR])).rejects.toThrow(/ChallengeCreated/);
  });

  it("reembolsar espera el recibo y devuelve el hash", async () => {
    const puerto = new PuertoFalso();
    const hash = await clienteCon(puerto).reembolsar(3n);

    expect(hash).toBe(HASH_A);
    expect(puerto.eventos).toEqual(["enviar refund nonce=0", "recibo 0xaaaa"]);
  });

  it("reembolsar con recibo reverted lanza TransaccionRevertidaError", async () => {
    const puerto = new PuertoFalso();
    puerto.statusDeRecibo = "reverted";
    const error = await clienteCon(puerto)
      .reembolsar(3n)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransaccionRevertidaError);
    expect((error as TransaccionRevertidaError).operacion).toBe("refund");
  });

  it("las tres escrituras comparten la misma cola", async () => {
    const puerto = new PuertoFalso();
    puerto.demoraRecibo = 10;
    const cliente = clienteCon(puerto);

    await Promise.all([
      cliente.crearReto(1n, 1n, [GANADOR]),
      cliente.reembolsar(1n),
      cliente.confirmarResultado(1n, GANADOR),
    ]);

    const orden = puerto.eventos.filter((e) => e !== "leerEstado").map((e) => e.split(" ")[0]);
    expect(orden).toEqual(["enviar", "recibo", "enviar", "recibo", "enviar", "recibo"]);
  });

  it("escalarUsdc lee los decimales una sola vez", async () => {
    const puerto = new PuertoFalso();
    const cliente = clienteCon(puerto);
    expect(await cliente.escalarUsdc(25)).toBe(25_000_000n);
    expect(await cliente.escalarUsdc(1)).toBe(1_000_000n);
    expect(puerto.lecturasDeDecimales).toBe(1);
  });
});

describe("cola compartida entre clientes", () => {
  it("dos clientes del mismo operador comparten cola por defecto", async () => {
    const puertoA = new PuertoFalso();
    const puertoB = new PuertoFalso();
    puertoA.demoraRecibo = 15;
    const config = configDesdeEnv(ENV_VALIDO);
    const orden: string[] = [];
    const a = crearChainClient(config, { puerto: puertoA });
    const b = crearChainClient(config, { puerto: puertoB });

    await Promise.all([
      a.reembolsar(1n).then(() => orden.push("a")),
      b.reembolsar(2n).then(() => orden.push("b")),
    ]);

    expect(orden).toEqual(["a", "b"]);
  });
});

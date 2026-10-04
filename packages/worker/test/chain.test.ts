import { describe, expect, it } from "vitest";
import { arbitrumSepolia } from "viem/chains";
import { arbitrumNitroLocal, arcTestnet, resolverCadena } from "../src/telegram/chain";
import { configDesdeEnv } from "../src/telegram/chain";

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


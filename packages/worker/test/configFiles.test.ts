import { describe, expect, it } from "vitest";
import wranglerToml from "../wrangler.toml?raw";
import devVarsExample from "../.dev.vars.example?raw";

const fuentes = import.meta.glob("../src/**/*.ts", { query: "?raw", import: "default", eager: true });

const ADDRESS_SCAN = /0x[0-9a-fA-F]{40}/;

describe("archivos de configuracion del worker", () => {
  it("wrangler.toml no contiene ninguna direccion 0x de 40 hex", () => {
    expect(wranglerToml).not.toMatch(ADDRESS_SCAN);
  });

  it("wrangler.toml usa Arbitrum Sepolia y no deja el id de Arc", () => {
    expect(wranglerToml).toMatch(/CHAIN_ID\s*=\s*"421614"/);
    expect(wranglerToml).not.toContain("5042002");
  });

  it("wrangler.toml conserva las vars del dashboard con keep_vars", () => {
    expect(wranglerToml).toMatch(/keep_vars\s*=\s*true/);
  });

  it(".dev.vars.example usa 421614 y solo placeholders", () => {
    expect(devVarsExample).toMatch(/^CHAIN_ID=421614$/m);
    expect(devVarsExample).not.toContain("5042002");
    expect(devVarsExample).not.toMatch(ADDRESS_SCAN);
  });

  it("ningun archivo de config ni fuente referencia ARBITRUM_RPC_URL", () => {
    expect(wranglerToml).not.toContain("ARBITRUM_RPC_URL");
    expect(devVarsExample).not.toContain("ARBITRUM_RPC_URL");
    for (const [ruta, contenido] of Object.entries(fuentes)) {
      expect(contenido, ruta).not.toContain("ARBITRUM_RPC_URL");
    }
  });

  it("ninguna fuente referencia el orquestador eliminado", () => {
    for (const [ruta, contenido] of Object.entries(fuentes)) {
      expect(contenido, ruta).not.toMatch(/from "\.{1,2}\/orchestrator"/);
    }
  });
});

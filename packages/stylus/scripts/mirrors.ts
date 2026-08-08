/**
 * Repos espejo por contrato para verificación en Arbiscan (Etherscan API v2).
 *
 * El verificador de Stylus de Etherscan clona la URL que recibe en `sourceCode`
 * y ejecuta `cargo metadata` desde la RAÍZ del repo clonado:
 *   - si la raíz tiene un Cargo.toml workspace (monorepo), no compila el
 *     contrato indicado en `contractname`, sino el primer paquete del workspace;
 *   - si la raíz NO tiene Cargo.toml (este flex monorepo), falla con
 *     "could not find `Cargo.toml` in ... or any parent directory".
 *
 * La solución es un repo público independiente POR CONTRATO, cuyo Cargo.toml
 * vive en la raíz. Este archivo es la fuente de verdad de esas URLs; lo consumen
 * `sync-mirrors.ts` (publicar source) y `verify-etherscan.ts` (verificar).
 */

import * as path from "path";

export interface ContractMirror {
  /** Nombre para logs. */
  name: string;
  /** Nombre del paquete Cargo (contractname de la verificación). */
  contractName: string;
  /** Ruta del contrato relativa a packages/stylus. */
  contractDir: string;
  /** URL pública del repo espejo (formato página / clone). */
  repoUrl: string;
  /** Rama que publica el nuevo source. */
  branch: string;
  /** Versión de compilador Stylus reportada a Etherscan. */
  compilerVersion: string;
}

const GH_ORG = "Zer0-Knowledge-Hack";

export const MIRRORS: ContractMirror[] = [
  {
    name: "TreasuryVault",
    contractName: "treasury_vault",
    contractDir: "contracts/treasury_vault",
    repoUrl: `https://github.com/${GH_ORG}/ottery-treasury-vault`,
    branch: "main",
    compilerVersion: "stylus:0.10.7",
  },
  {
    name: "ChallengePool",
    contractName: "challenge_pool",
    contractDir: "contracts/challenge_pool",
    repoUrl: `https://github.com/${GH_ORG}/ottery-challenge-pool`,
    branch: "main",
    compilerVersion: "stylus:0.10.7",
  },
  {
    name: "AaveStrategy",
    contractName: "aave_strategy",
    contractDir: "contracts/aave_strategy",
    repoUrl: `https://github.com/${GH_ORG}/ottery-aave-strategy`,
    branch: "main",
    compilerVersion: "stylus:0.10.7",
  },
];

/** Raíz del paquete stylus (packages/stylus). */
export const STYLUS_ROOT = path.resolve(__dirname, "..");
/** Raíz del monorepo. */
export const REPO_ROOT = path.resolve(STYLUS_ROOT, "../..");
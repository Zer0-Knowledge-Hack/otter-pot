/**
 * Fuente única de red + addresses OtterPot.
 * Pruebas: Arbitrum Sepolia (421614). Addresses solo desde env (.env.local).
 * ABI en challengePoolAbi.ts / erc20Abi.ts — no mezclar addresses ahí.
 */
import { parseUnits, formatUnits, isAddress, type Address } from "viem";
import deployedContracts from "./deployedContracts";
import { challengePoolAbi } from "./challengePoolAbi";
import { erc20Abi } from "./erc20Abi";
import {
  DEFAULT_STABLE,
  NATIVE_USDC_ARBITRUM_ONE,
  NATIVE_USDT_ARBITRUM_ONE,
  STABLE_DECIMALS,
  addressForStable,
  getStableAddresses,
  resolveDefaultStable,
  type StableSymbol,
} from "./tokens";

export {
  DEFAULT_STABLE,
  NATIVE_USDC_ARBITRUM_ONE,
  NATIVE_USDT_ARBITRUM_ONE,
  STABLE_DECIMALS,
  addressForStable,
  getStableAddresses,
  resolveDefaultStable,
};
export type { StableSymbol };

export type NetworkKey = "arbitrum" | "arbitrumSepolia" | "nitro";

export type NetworkContracts = {
  key: NetworkKey;
  chainId: number;
  name: string;
  rpcUrl: string;
  challengePool: Address | "";
  settlementToken: Address | "";
  settlementSymbol: StableSymbol;
  usdc: Address | "";
  usdt: Address | "";
  treasuryVault: Address | "";
  aaveStrategy: Address | "";
};

function envAddress(value: string | undefined): Address | "" {
  if (!value || value === "undefined") return "";
  return isAddress(value) ? (value as Address) : "";
}

const sepoliaDeployed = deployedContracts["421614"];
const nitroDeployed = deployedContracts["412346"];

/**
 * Default de pruebas = Arbitrum Sepolia.
 * One solo si NEXT_PUBLIC_NETWORK=arbitrum explícitamente.
 */
export function resolveNetworkKey(): NetworkKey {
  const raw = (process.env.NEXT_PUBLIC_NETWORK || "").toLowerCase().trim();
  if (raw === "arbitrum" || raw === "mainnet" || raw === "arbitrum-one") return "arbitrum";
  if (raw === "nitro" || raw === "local") return "nitro";
  if (
    raw === "arbitrumsepolia" ||
    raw === "sepolia" ||
    raw === "arbitrum-sepolia" ||
    raw === ""
  ) {
    return "arbitrumSepolia";
  }

  const chainId = Number(
    process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_CHAIN_ID ||
      process.env.NEXT_PUBLIC_ARBITRUM_CHAIN_ID ||
      421614,
  );
  if (chainId === 42161) return "arbitrum";
  if (chainId === 412346) return "nitro";
  return "arbitrumSepolia";
}

export function getNetworkContracts(key: NetworkKey = resolveNetworkKey()): NetworkContracts {
  const symbol = resolveDefaultStable();

  if (key === "arbitrumSepolia") {
    const chainId = Number(process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_CHAIN_ID || 421614);
    const stables = getStableAddresses(chainId);
    return {
      key,
      chainId: 421614,
      name: "Arbitrum Sepolia",
      rpcUrl:
        process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ||
        "https://sepolia-rollup.arbitrum.io/rpc",
      // Env principal primero (centralizado en .env.local)
      challengePool:
        envAddress(process.env.NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS) ||
        envAddress(process.env.NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS_SEPOLIA) ||
        (sepoliaDeployed?.ChallengePool?.address as Address) ||
        "",
      settlementToken: addressForStable(symbol, 421614) || stables.USDC || "",
      settlementSymbol: symbol,
      usdc: stables.USDC,
      usdt: stables.USDT,
      treasuryVault:
        envAddress(process.env.NEXT_PUBLIC_TREASURY_VAULT_ADDRESS) ||
        envAddress(process.env.NEXT_PUBLIC_TREASURY_VAULT_ADDRESS_SEPOLIA) ||
        (sepoliaDeployed?.TreasuryVault?.address as Address) ||
        "",
      aaveStrategy:
        envAddress(process.env.NEXT_PUBLIC_AAVE_V3_STRATEGY_ADDRESS) ||
        envAddress(process.env.NEXT_PUBLIC_AAVE_STRATEGY_ADDRESS) ||
        (sepoliaDeployed?.AaveStrategy?.address as Address) ||
        "",
    };
  }

  if (key === "nitro") {
    const stables = getStableAddresses(412346);
    return {
      key,
      chainId: 412346,
      name: "Nitro DevNode",
      rpcUrl: process.env.NEXT_PUBLIC_NITRO_RPC_URL || "http://localhost:8547",
      challengePool:
        envAddress(process.env.NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS_NITRO) ||
        (nitroDeployed?.ChallengePool?.address as Address) ||
        "",
      settlementToken: addressForStable(symbol, 412346) || stables.USDC || "",
      settlementSymbol: symbol,
      usdc: stables.USDC,
      usdt: stables.USDT,
      treasuryVault: (nitroDeployed?.TreasuryVault?.address as Address) || "",
      aaveStrategy: "",
    };
  }

  const stables = getStableAddresses(42161);
  return {
    key: "arbitrum",
    chainId: 42161,
    name: "Arbitrum One",
    rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    challengePool: envAddress(process.env.NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS) || "",
    settlementToken: addressForStable(symbol, 42161) || stables.USDC || NATIVE_USDC_ARBITRUM_ONE,
    settlementSymbol: symbol,
    usdc: stables.USDC || NATIVE_USDC_ARBITRUM_ONE,
    usdt: stables.USDT || NATIVE_USDT_ARBITRUM_ONE,
    treasuryVault: envAddress(process.env.NEXT_PUBLIC_TREASURY_VAULT_ADDRESS) || "",
    aaveStrategy: envAddress(process.env.NEXT_PUBLIC_AAVE_V3_STRATEGY_ADDRESS) || "",
  };
}

export const activeNetwork = getNetworkContracts();

export const CHAIN_ID = activeNetwork.chainId;
export const CHALLENGE_POOL_ADDRESS = activeNetwork.challengePool;
export const TREASURY_VAULT_ADDRESS = activeNetwork.treasuryVault;
export const AAVE_V3_STRATEGY_ADDRESS = activeNetwork.aaveStrategy;
export const USDC_ADDRESS = activeNetwork.settlementToken || activeNetwork.usdc;
export const USDT_ADDRESS = activeNetwork.usdt;
export const SETTLEMENT_SYMBOL = activeNetwork.settlementSymbol;
export const CHALLENGE_POOL_READY = Boolean(CHALLENGE_POOL_ADDRESS && USDC_ADDRESS);

export const contractsConfig = {
  network: activeNetwork,
  abi: {
    challengePool: challengePoolAbi,
    erc20: erc20Abi,
  },
  tokens: {
    default: SETTLEMENT_SYMBOL,
    usdc: activeNetwork.usdc,
    usdt: activeNetwork.usdt,
    settlement: USDC_ADDRESS,
  },
  addresses: {
    challengePool: CHALLENGE_POOL_ADDRESS,
    treasuryVault: TREASURY_VAULT_ADDRESS,
    aaveStrategy: AAVE_V3_STRATEGY_ADDRESS,
    usdc: USDC_ADDRESS,
  },
} as const;

export function isValidWalletAddress(value: string | undefined | null): value is Address {
  return Boolean(value && isAddress(value));
}

/**
 * Monto humano → unidades base USDC/USDT (SIEMPRE 6 decimales).
 * Ej: 5 → 5000000n · 0.00004 → 40n
 * Nunca pases unidades base aquí (si amount >= 1e9 probablemente ya es base).
 */
export function parseUsdc(amount: number | string): bigint {
  let normalized: string;
  if (typeof amount === "number") {
    if (!Number.isFinite(amount) || amount < 0) normalized = "0";
    else normalized = amount.toFixed(STABLE_DECIMALS);
  } else {
    normalized = amount.trim().replace(",", ".") || "0";
  }
  // Evita notación científica rota en parseUnits
  if (normalized.includes("e") || normalized.includes("E")) {
    const n = Number(normalized);
    normalized = Number.isFinite(n) ? n.toFixed(STABLE_DECIMALS) : "0";
  }
  return parseUnits(normalized, STABLE_DECIMALS);
}

/**
 * Unidades base → texto humano (6 decimales on-chain).
 * Montos pequeños de testnet se ven completos (hasta 6 dígitos).
 */
export function formatUsdc(value: bigint, digits = 6): string {
  const raw = formatUnits(value, STABLE_DECIMALS);
  const n = Number(raw);
  if (!Number.isFinite(n)) return "0";
  const max = n > 0 && n < 0.01 ? STABLE_DECIMALS : Math.min(Math.max(digits, 2), STABLE_DECIMALS);
  return n.toLocaleString("en-US", {
    useGrouping: true,
    maximumFractionDigits: max,
    minimumFractionDigits: 0,
  });
}

/** Monto humano (Firebase / UI) → texto con hasta 6 decimales. */
export function formatHumanUsdc(amount: number | string, digits = 6): string {
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n)) return "0";
  const max = n > 0 && n < 0.01 ? STABLE_DECIMALS : Math.min(digits, STABLE_DECIMALS);
  return n.toLocaleString("en-US", {
    useGrouping: true,
    maximumFractionDigits: max,
    minimumFractionDigits: 0,
  });
}

/** Unidades base como entero (debug / MetaMask mal configurado). */
export function usdcBaseUnitsLabel(value: bigint): string {
  return `${value.toString()} (base · 10^${STABLE_DECIMALS})`;
}

export const usdcToBaseUnits = parseUsdc;
export const stableToBaseUnits = parseUsdc;

export function deadlineFromDays(days: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + days * 24 * 60 * 60);
}

export function challengePoolNotConfiguredMessage() {
  return `Contratos no configurados para ${activeNetwork.name}. Revisa NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS y NEXT_PUBLIC_USDC_ADDRESS en .env.local.`;
}

export function assertContractsConfigured() {
  if (!CHALLENGE_POOL_ADDRESS) {
    throw new Error("Falta NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS");
  }
  if (!USDC_ADDRESS) {
    throw new Error("Falta NEXT_PUBLIC_USDC_ADDRESS (debe ser el USDC del ChallengePool en esta red)");
  }
}

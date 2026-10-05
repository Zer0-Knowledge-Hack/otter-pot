/**
 * Stablecoins soportadas en UI. El ChallengePool on-chain usa UN token
 * (parámetro `usdc` en init) — por defecto USDC; USDT es opción de producto/UI.
 */
import type { Address } from "viem";
import { isAddress } from "viem";

export type StableSymbol = "USDC" | "USDT";

export const DEFAULT_STABLE: StableSymbol = "USDC";

/** Circle native USDC — Arbitrum One */
export const NATIVE_USDC_ARBITRUM_ONE =
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const satisfies Address;

/** Tether USD — Arbitrum One */
export const NATIVE_USDT_ARBITRUM_ONE =
  "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as const satisfies Address;

/** Decimals estándar USDC/USDT en Arbitrum */
export const STABLE_DECIMALS = 6;

function envAddress(value: string | undefined): Address | "" {
  if (!value || value === "undefined") return "";
  return isAddress(value) ? (value as Address) : "";
}

export function resolveDefaultStable(): StableSymbol {
  const raw = (process.env.NEXT_PUBLIC_DEFAULT_STABLE || "USDC").toUpperCase().trim();
  return raw === "USDT" ? "USDT" : "USDC";
}

export function getStableAddresses(chainId: number): Record<StableSymbol, Address | ""> {
  if (chainId === 42161) {
    return {
      USDC: envAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS) || NATIVE_USDC_ARBITRUM_ONE,
      USDT: envAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS) || NATIVE_USDT_ARBITRUM_ONE,
    };
  }
  if (chainId === 421614) {
    return {
      USDC:
        envAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS_SEPOLIA) ||
        envAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS) ||
        ("0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as Address),
      USDT:
        envAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS_SEPOLIA) ||
        envAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS) ||
        "",
    };
  }
  // Nitro / local — solo env
  return {
    USDC:
      envAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS_NITRO) ||
      envAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS) ||
      "",
    USDT:
      envAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS_NITRO) ||
      envAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS) ||
      "",
  };
}

export function addressForStable(
  symbol: StableSymbol,
  chainId: number,
): Address | "" {
  return getStableAddresses(chainId)[symbol];
}

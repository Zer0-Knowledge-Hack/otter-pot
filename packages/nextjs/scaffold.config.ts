// @ts-nocheck

import * as chains from "./utils/scaffold-stylus/supportedChains";
import { Chain } from "viem/chains";
import { resolveNetworkKey } from "./contracts/config";

export type ScaffoldConfig = {
  targetNetworks: readonly Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
  walletAutoConnect: boolean;
  gasFeeMultiplier?: number;
};

export const DEFAULT_ALCHEMY_API_KEY = "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

// Tupla de una cadena concreta (no `Chain[]`): los tipos de contrato del scaffold
// (`utils/scaffold-eth/contract.ts`) y `createConfig` de wagmi necesitan el chainId literal.
type TargetNetworks =
  | readonly [typeof chains.arbitrumSepolia]
  | readonly [typeof chains.arbitrumNitro]
  | readonly [typeof chains.arbitrum];

function resolveTargetNetworks(): TargetNetworks {
  const key = resolveNetworkKey();
  if (key === "arbitrumSepolia") {
    return [chains.arbitrumSepolia];
  }
  if (key === "nitro") {
    return [chains.arbitrumNitro];
  }
  // Producción: solo Arbitrum One
  return [chains.arbitrum];
}

const scaffoldConfig = {
  targetNetworks: resolveTargetNetworks(),

  pollingInterval: 3000,

  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,

  rpcOverrides: {
    [chains.arbitrum.id]:
      process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    [chains.arbitrumSepolia.id]:
      process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ||
      "https://sepolia-rollup.arbitrum.io/rpc",
  },

  // Fallback = project ID demo de Scaffold (público). Usa el tuyo en .env.local para producción.
  walletConnectProjectId:
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",

  onlyLocalBurnerWallet: true,

  // Auto-reconnect: si MetaMask no está (LAN / sin extensión), WalletErrorSilence lo silencia
  walletAutoConnect: true,

  gasFeeMultiplier: 2,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;

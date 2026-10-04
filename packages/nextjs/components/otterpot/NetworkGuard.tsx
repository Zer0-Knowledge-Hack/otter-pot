"use client";

import { useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { activeNetwork } from "~~/contracts/config";

/**
 * Si la wallet está conectada en otra red, intenta cambiar a la red objetivo (Sepolia).
 * No bloquea la UI; el usuario puede rechazar el prompt de MetaMask.
 */
export function NetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !switchChainAsync) return;
    if (chainId === activeNetwork.chainId) {
      tried.current = null;
      return;
    }

    const key = `${chainId}->${activeNetwork.chainId}`;
    if (tried.current === key) return;
    tried.current = key;

    void switchChainAsync({ chainId: activeNetwork.chainId }).catch(err => {
      console.info(`Cambio a ${activeNetwork.name} pendiente:`, err);
    });
  }, [isConnected, chainId, switchChainAsync]);

  return null;
}

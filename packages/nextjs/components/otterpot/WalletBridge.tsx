"use client";

import { useEffect } from "react";
import { useAccount, useChainId } from "wagmi";
import { loginWithWallet, isFirebaseConfigured, clearGuestSession } from "~~/services/firebase/auth";
import { useWalletStore } from "~~/services/otterpot/walletStore";

/** Sincroniza Wagmi → store global (la UI puede leer wallet sin bloquear el primer paint). */
export function WalletBridge() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const setReady = useWalletStore(s => s.setReady);
  const setWallet = useWalletStore(s => s.setWallet);

  useEffect(() => {
    setReady(true);
    return () => setReady(false);
  }, [setReady]);

  useEffect(() => {
    setWallet({
      isConnected,
      isConnecting,
      address: address,
      chainId,
    });
  }, [address, isConnected, isConnecting, chainId, setWallet]);

  useEffect(() => {
    if (!isFirebaseConfigured || !isConnected || !address) return;
    clearGuestSession();
    void loginWithWallet(address).catch(err => console.warn("loginWithWallet:", err));
  }, [isConnected, address]);

  return null;
}

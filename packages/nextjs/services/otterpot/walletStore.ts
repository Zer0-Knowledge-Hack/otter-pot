import type { Address } from "viem";
import { create } from "zustand";

type WalletState = {
  /** true cuando Wagmi/RainbowKit ya montó */
  ready: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  address?: Address;
  chainId?: number;
  setReady: (ready: boolean) => void;
  setWallet: ( partial: Partial<Pick<WalletState, "isConnected" | "isConnecting" | "address" | "chainId">>) => void;
  reset: () => void;
};

export const useWalletStore = create<WalletState>(set => ({
  ready: false,
  isConnected: false,
  isConnecting: false,
  address: undefined,
  chainId: undefined,
  setReady: ready => set({ ready }),
  setWallet: partial => set(partial),
  reset: () =>
    set({
      ready: false,
      isConnected: false,
      isConnecting: false,
      address: undefined,
      chainId: undefined,
    }),
}));

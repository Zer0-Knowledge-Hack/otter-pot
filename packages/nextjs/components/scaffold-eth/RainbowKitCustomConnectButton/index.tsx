"use client";

import dynamic from "next/dynamic";

/**
 * Client-only wrapper: avoids SSR of RainbowKit → Coinbase CDP → @x402/* (missing peers).
 */
export const RainbowKitCustomConnectButton = dynamic(
  () =>
    import("./RainbowKitCustomConnectButtonInner").then(m => m.RainbowKitCustomConnectButtonInner),
  {
    ssr: false,
    loading: () => (
      <div className="inline-flex items-center">
        <button className="btn btn-sm bg-secondary" type="button" disabled>
          Connect Wallet
        </button>
      </div>
    ),
  },
);

export type { RainbowKitCustomConnectButtonProps } from "./RainbowKitCustomConnectButtonInner";

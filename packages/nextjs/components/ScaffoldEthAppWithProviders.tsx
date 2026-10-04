"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import "@rainbow-me/rainbowkit/styles.css";
import { BackGround } from "./Background";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { NetworkGuard } from "~~/components/otterpot/NetworkGuard";
import { WalletBridge } from "~~/components/otterpot/WalletBridge";
import { WalletErrorSilence } from "~~/components/otterpot/WalletErrorSilence";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { activeNetwork } from "~~/contracts/config";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { arbitrumNitro, initBurnerPK } from "~~/utils/scaffold-stylus";
import * as viemChains from "viem/chains";

const MARKETING_PATHS = new Set(["/", "/login", "/app", "/como-usar", "/manual"]);

const ScaffoldEthApp = ({ children }: { children: ReactNode }) => {
  const { targetNetwork } = useTargetNetwork();
  const pathname = usePathname();
  const isMarketing =
    MARKETING_PATHS.has(pathname) ||
    pathname?.startsWith("/app") ||
    pathname?.startsWith("/como-usar") ||
    pathname?.startsWith("/manual") ||
    pathname?.startsWith("/como-usar") ||
    pathname?.startsWith("/login");

  useEffect(() => {
    if (targetNetwork.id === arbitrumNitro.id) {
      initBurnerPK();
    }
  }, [targetNetwork]);

  return (
    <>
      <div className="flex min-h-screen flex-col">
        {!isMarketing ? <Header /> : null}
        <main className="relative flex flex-1 flex-col">
          {!isMarketing ? <BackGround /> : null}
          {children}
        </main>
        {!isMarketing ? <Footer /> : null}
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

/** Shell Wagmi — AuthProvider vive fuera (ClientProviders) para no bloquear Firebase. */
export function Web3Shell({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDarkMode = !mounted || resolvedTheme !== "light";

  const initialChain =
    activeNetwork.chainId === 421614
      ? viemChains.arbitrumSepolia
      : activeNetwork.chainId === 42161
        ? viemChains.arbitrum
        : undefined;

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <WalletErrorSilence />
        <WalletBridge />
        <ProgressBar height="3px" color="#f47434" />
        <RainbowKitProvider
          avatar={BlockieAvatar}
          initialChain={initialChain}
          theme={
            isDarkMode
              ? darkTheme({ accentColor: "#f47434", borderRadius: "medium" })
              : lightTheme({ accentColor: "#f47434", borderRadius: "medium" })
          }
        >
          <NetworkGuard />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/** Compat: nombre antiguo */
export const ScaffoldEthAppWithProviders = Web3Shell;

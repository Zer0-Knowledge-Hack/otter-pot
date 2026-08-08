"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BackGround } from "./Background";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { AuthProvider } from "~~/components/otterpot/AuthProvider";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { arbitrumNitro, initBurnerPK } from "~~/utils/scaffold-stylus";

const MARKETING_PATHS = new Set(["/", "/login", "/app"]);

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  const { targetNetwork } = useTargetNetwork();
  const pathname = usePathname();
  const isMarketing = MARKETING_PATHS.has(pathname) || pathname.startsWith("/app");

  useEffect(() => {
    if (targetNetwork.id === arbitrumNitro.id) {
      initBurnerPK();
    }
  }, [targetNetwork]);

  return (
    <>
      <div className="flex flex-col min-h-screen">
        {!isMarketing ? <Header /> : null}
        <main className="relative flex flex-col flex-1">
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

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Nunca return null: eso dejaba la web en blanco.
  // Hasta montar usamos tema dark OtterPot por defecto.
  const isDarkMode = !mounted || resolvedTheme !== "light";

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ProgressBar height="3px" color="#f47434" />
        <RainbowKitProvider
          avatar={BlockieAvatar}
          theme={
            isDarkMode
              ? darkTheme({ accentColor: "#f47434", borderRadius: "medium" })
              : lightTheme({ accentColor: "#f47434", borderRadius: "medium" })
          }
        >
          <AuthProvider>
            <ScaffoldEthApp>{children}</ScaffoldEthApp>
          </AuthProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

"use client";

import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { AuthProvider } from "~~/components/otterpot/AuthProvider";
// Efecto al importar: filtra los rechazos benignos de wallet desde el arranque.
import "~~/components/otterpot/WalletErrorSilence";

const loadWeb3Shell = () => import("~~/components/ScaffoldEthAppWithProviders");

// Chunk aparte: Wagmi + RainbowKit + conectores (MetaMask SDK, WalletConnect, ...)
// pesan mucho y la landing no los usa. Con SSR activo, el export estático sigue
// prerenderizando las páginas que usan hooks de wagmi.
const Web3Shell = dynamic(() => loadWeb3Shell().then(m => m.Web3Shell));

/** Solo la landing no toca la wallet: se renderiza sin Wagmi ni RainbowKit. */
function needsWallet(pathname: string | null) {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  return path !== "/";
}

/** Precarga el chunk de Web3 cuando el navegador está libre, para que las páginas con wallet abran rápido. */
function usePrefetchWeb3Shell(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const prefetch = () => void loadWeb3Shell();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, [enabled]);
}

/** Auth (Firebase) siempre montado; Wagmi solo en las rutas que lo necesitan. */
export function ClientProviders({ children }: { children: ReactNode }) {
  const withWallet = needsWallet(usePathname());
  usePrefetchWeb3Shell(!withWallet);

  return (
    <AuthProvider>
      {withWallet ? (
        <Web3Shell>{children}</Web3Shell>
      ) : (
        <>
          <ProgressBar height="3px" color="#f47434" />
          {/* Mismo contenedor que ScaffoldEthApp da a las páginas de marketing. */}
          <div className="flex min-h-screen flex-col">
            <main className="relative flex flex-1 flex-col">{children}</main>
          </div>
        </>
      )}
    </AuthProvider>
  );
}

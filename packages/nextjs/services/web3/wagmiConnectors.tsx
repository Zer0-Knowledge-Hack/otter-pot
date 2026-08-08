import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
// coinbaseWallet omitido: tira @coinbase/cdp-sdk → @x402/* (peer deps opcionales) y rompe el build.
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

import scaffoldConfig from "~~/scaffold.config";

const { onlyLocalBurnerWallet, targetNetworks } = scaffoldConfig;

rainbowkitBurnerWallet.rpcUrls = {
  [arbitrumNitro.id]: arbitrumNitro.rpcUrls.default.http[0],
};

const wallets = [
  ...(!targetNetworks.some(network => network.id !== (arbitrumNitro as chains.Chain).id) || !onlyLocalBurnerWallet
    ? [rainbowkitBurnerWallet]
    : []),
  braveWallet,
  metaMaskWallet,
  walletConnectWallet,
  ledgerWallet,
  rainbowWallet,
  safeWallet,
];

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = () => {
  // Client-only (ClientProviders ya desactiva SSR de Wagmi)
  if (typeof window === "undefined") {
    return [];
  }

  return connectorsForWallets(
    [
      {
        groupName: "Supported Wallets",
        wallets,
      },
    ],
    {
      appName: "OtterPot",
      projectId: scaffoldConfig.walletConnectProjectId,
    },
  );
};

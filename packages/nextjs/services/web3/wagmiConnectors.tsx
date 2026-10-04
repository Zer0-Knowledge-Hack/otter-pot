import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
// coinbaseWallet omitido: peer deps @x402/* rompen el build (ver next.config aliases).
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";
import scaffoldConfig from "~~/scaffold.config";
import { appConfig } from "~~/services/otterpot/config";

const { onlyLocalBurnerWallet, targetNetworks } = scaffoldConfig;

rainbowkitBurnerWallet.rpcUrls = {
  [arbitrumNitro.id]: arbitrumNitro.rpcUrls.default.http[0],
};

const wallets = [
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
  braveWallet,
  ledgerWallet,
  safeWallet,
  ...(!targetNetworks.some(network => network.id !== (arbitrumNitro as chains.Chain).id) ||
  !onlyLocalBurnerWallet
    ? [rainbowkitBurnerWallet]
    : []),
];

/**
 * wagmi connectors — cada usuario conecta SU wallet (no hay wallet fija de app).
 * WalletConnect Project ID identifica la app Reown, no al usuario.
 */
export const wagmiConnectors = () => {
  if (typeof window === "undefined") {
    return [];
  }

  const projectId =
    appConfig.wallet.walletConnectProjectId || scaffoldConfig.walletConnectProjectId;

  return connectorsForWallets(
    [
      {
        groupName: "Wallets",
        wallets,
      },
    ],
    {
      appName: appConfig.wallet.appName || "OtterPot",
      projectId,
    },
  );
};

"use client";

// @refresh reset
import { useState } from "react";
import { Balance } from "../Balance";
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import { BurnerWalletModal } from "./BurnerWalletModal";
import { RevealBurnerPKModal } from "./RevealBurnerPKModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { useNetworkColor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { saveBurnerPK } from "~~/utils/scaffold-stylus/burner";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";
import { cn } from "~~/utils/cn";
import { useTranslation } from "~~/lib/i18n";

export type RainbowKitCustomConnectButtonProps = {
  /** Oculta balance/red y usa botón de wallet compacto (móvil / header) */
  compact?: boolean;
  className?: string;
};

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 * Loaded only on the client — RainbowKit pulls optional @x402 peers that break SSR.
 */
export function RainbowKitCustomConnectButtonInner({
  compact = false,
  className,
}: RainbowKitCustomConnectButtonProps = {}) {
  const networkColor = useNetworkColor();
  const { targetNetwork } = useTargetNetwork();
  const { t } = useTranslation();
  const [isBurnerModalOpen, setIsBurnerModalOpen] = useState(false);

  const handleBurnerWalletSelect = async (privateKey: string) => {
    saveBurnerPK({ privateKey: privateKey as `0x${string}` });
    window.location.reload();
  };

  return (
    <div className={cn("inline-flex items-center", className)}>
      <ConnectButton.Custom>
        {({ account, chain, openConnectModal, mounted }) => {
          const connected = mounted && account && chain;

          const handleConnect = () => {
            openConnectModal();
          };

          return (
            <>
              {(() => {
                if (!connected) {
                  return (
                    <div className="flex items-center gap-1">
                      <button
                        className={cn(
                          "btn bg-secondary",
                          compact ? "btn-xs h-9 min-h-0 rounded-xl px-3 text-xs" : "btn-sm",
                        )}
                        onClick={handleConnect}
                        type="button"
                        data-testid="connect-wallet"
                      >
                        {compact ? t("account.connectWallet") : t("login.walletTitle")}
                      </button>
                      {!compact && targetNetwork.id === arbitrumNitro.id ? (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => setIsBurnerModalOpen(true)}
                          type="button"
                          title="Burner (solo Nitro local)"
                        >
                          Burner
                        </button>
                      ) : null}
                    </div>
                  );
                }

                if (chain.unsupported || chain.id !== targetNetwork.id) {
                  return <WrongNetworkDropdown />;
                }

                return (
                  <>
                    {!compact ? (
                      <div className="mr-1 flex flex-col items-center">
                        <Balance address={account.address as Address} className="h-auto min-h-0" />
                        <span className="text-xs" style={{ color: networkColor }}>
                          {chain.name}
                        </span>
                      </div>
                    ) : null}
                    <AddressInfoDropdown
                      address={account.address as Address}
                      displayName={account.displayName}
                      ensAvatar={account.ensAvatar}
                      onSwitchAccount={() => setIsBurnerModalOpen(true)}
                      compact={compact}
                    />
                    <AddressQRCodeModal address={account.address as Address} modalId="qrcode-modal" />
                    <RevealBurnerPKModal />
                  </>
                );
              })()}
            </>
          );
        }}
      </ConnectButton.Custom>

      <BurnerWalletModal
        isOpen={isBurnerModalOpen}
        onClose={() => setIsBurnerModalOpen(false)}
        onSelectAccount={handleBurnerWalletSelect}
      />
    </div>
  );
}

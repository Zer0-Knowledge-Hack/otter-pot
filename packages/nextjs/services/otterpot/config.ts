import {
  activeNetwork,
  CHALLENGE_POOL_ADDRESS,
  TREASURY_VAULT_ADDRESS,
  AAVE_V3_STRATEGY_ADDRESS,
  CHALLENGE_POOL_READY,
  USDC_ADDRESS,
  USDT_ADDRESS,
  SETTLEMENT_SYMBOL,
  resolveNetworkKey,
} from "~~/contracts/config";

export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "OtterPot",
  url: process.env.NEXT_PUBLIC_APP_URL || "",
  tagline: "Convierte tus metas en retos con recompensas reales",
  description:
    "Crea retos con amigos, aporta al pozo compartido y gana recompensas cuando cumplas el objetivo.",
  mission:
    "Hacer que cumplir metas sea más fácil cuando hay amigos, reglas claras y recompensas reales.",
  vision:
    "Ser la forma más simple y confiable de organizar retos con premio compartido, desde amigos hasta comunidades.",
  currency: SETTLEMENT_SYMBOL,
  supportedCurrencies: ["USDC", "USDT"] as const,
  track: "Arbitrum  —  OtterPot",

  firebase: {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    configured: Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
        (process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.length || 0) >= 20,
    ),
  },

  wallet: {
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "",
    appName: process.env.NEXT_PUBLIC_APP_NAME || "OtterPot",
  },

  network: {
    key: resolveNetworkKey(),
    chainId: activeNetwork.chainId,
    name: activeNetwork.name,
    rpcUrl: activeNetwork.rpcUrl,
  },

  contracts: {
    challengePool: CHALLENGE_POOL_ADDRESS || "",
    treasuryVault: TREASURY_VAULT_ADDRESS || "",
    aaveStrategy: AAVE_V3_STRATEGY_ADDRESS || "",
    usdc: USDC_ADDRESS || "",
    usdt: USDT_ADDRESS || "",
    settlement: SETTLEMENT_SYMBOL,
    ready: CHALLENGE_POOL_READY,
  },

  telegram: {
    botUsername: (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "otter_pot_bot").replace(/^@/, ""),
    botUrl:
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ||
      `https://t.me/${(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "otter_pot_bot").replace(/^@/, "")}`,
    miniAppUrl:
      process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_URL ||
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ||
      `https://t.me/${(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "otter_pot_bot").replace(/^@/, "")}`,
    groupUrl:
      process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL || "https://t.me/+cX2Bz_P2mT5mMWQx",
  },

  telegramBotUsername: (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "otter_pot_bot").replace(
    /^@/,
    "",
  ),
  telegramBotUrl:
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ||
    `https://t.me/${(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "otter_pot_bot").replace(/^@/, "")}`,
  telegramMiniAppUrl:
    process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_URL ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL ||
    `https://t.me/${(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "otter_pot_bot").replace(/^@/, "")}`,
  telegramGroupUrl:
    process.env.NEXT_PUBLIC_TELEGRAM_GROUP_URL || "https://t.me/+cX2Bz_P2mT5mMWQx",

  colors: {
    bg: "#111D43",
    card: "#182548",
    action: "#F47434",
    text: "#FFFFFF",
    muted: "#8B97B8",
  },
} as const;

import { appConfig } from "~~/services/otterpot/config";

export type TelegramSession = {
  connected: boolean;
  inMiniApp: boolean;
  userId?: number;
  username?: string;
  firstName?: string;
  syncedAt: number;
};

export type TelegramLoginUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            username?: string;
          };
        };
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        openTelegramLink?: (url: string) => void;
        HapticFeedback?: {
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
          notificationOccurred: (type: "success" | "error" | "warning") => void;
        };
      };
    };
    onTelegramAuth?: (user: TelegramLoginUser) => void;
  }
}

/** Abre cualquier link t.me (grupo, bot, mini app). */
export function openTelegramUrl(url: string) {
  if (!url || typeof window === "undefined") return;
  const tg = getTelegramWebApp();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function getTelegramWebApp() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
}

export function isTelegramMiniApp(): boolean {
  const tg = getTelegramWebApp();
  return Boolean(tg?.initData);
}

export function getTelegramSession(): TelegramSession {
  const tg = getTelegramWebApp();
  const user = tg?.initDataUnsafe?.user;
  const inMiniApp = Boolean(tg?.initData);
  return {
    connected: Boolean(user?.id),
    inMiniApp,
    userId: user?.id,
    username: user?.username || undefined,
    firstName: user?.first_name || undefined,
    syncedAt: Date.now(),
  };
}

export function initTelegramMiniApp() {
  const tg = getTelegramWebApp();
  if (!tg?.initData) return null;

  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor?.(appConfig.colors.bg);
    tg.setBackgroundColor?.(appConfig.colors.bg);
  } catch {
    // Older clients may not support color APIs
  }
  return tg;
}

export function botUsernameFromUrl() {
  const username = appConfig.telegram.botUsername || "otter_pot_bot";
  return username.startsWith("@") ? username : `@${username}`;
}

export function openTelegramBot() {
  openTelegramUrl(appConfig.telegram.botUrl || appConfig.telegramBotUrl);
}

export function openTelegramMiniApp() {
  openTelegramUrl(appConfig.telegram.miniAppUrl || appConfig.telegram.botUrl || appConfig.telegramBotUrl);
}

export function openTelegramGroup() {
  openTelegramUrl(appConfig.telegram.groupUrl || appConfig.telegramGroupUrl);
}

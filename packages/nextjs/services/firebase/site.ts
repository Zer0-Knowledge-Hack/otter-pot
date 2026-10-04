import { get, onValue, push, ref, set, type Unsubscribe } from "firebase/database";
import { db, isFirebaseConfigured } from "~~/services/firebase/firebase.config";
import { appConfig } from "~~/services/otterpot/config";

/** Ajustable desde Firebase RTDB → `siteConfig` (solo lectura pública). */
export type SiteConfig = {
  tagline: string;
  description: string;
  heroEyebrow: string;
  contactEmail: string;
  telegramBotUsername: string;
  telegramBotUrl: string;
  telegramGroupUrl: string;
  telegramMiniAppUrl: string;
  showLiveStats: boolean;
};

export function defaultSiteConfig(): SiteConfig {
  const bot = appConfig.telegram.botUsername || "otter_pot_bot";
  return {
    tagline: appConfig.tagline,
    description: appConfig.description,
    heroEyebrow: "Retos con recompensas reales",
    contactEmail: "hola@otterpot.app",
    telegramBotUsername: bot,
    telegramBotUrl: appConfig.telegram.botUrl || `https://t.me/${bot}`,
    telegramGroupUrl: appConfig.telegram.groupUrl || "https://t.me/+cX2Bz_P2mT5mMWQx",
    telegramMiniAppUrl: appConfig.telegram.miniAppUrl || appConfig.telegram.botUrl || `https://t.me/${bot}`,
    showLiveStats: true,
  };
}

function mergeSiteConfig(raw: Partial<SiteConfig> | null | undefined): SiteConfig {
  const base = defaultSiteConfig();
  if (!raw || typeof raw !== "object") return base;
  return {
    tagline: typeof raw.tagline === "string" && raw.tagline ? raw.tagline : base.tagline,
    description:
      typeof raw.description === "string" && raw.description ? raw.description : base.description,
    heroEyebrow:
      typeof raw.heroEyebrow === "string" && raw.heroEyebrow ? raw.heroEyebrow : base.heroEyebrow,
    contactEmail:
      typeof raw.contactEmail === "string" && raw.contactEmail ? raw.contactEmail : base.contactEmail,
    telegramBotUsername:
      typeof raw.telegramBotUsername === "string" && raw.telegramBotUsername
        ? raw.telegramBotUsername.replace(/^@/, "")
        : base.telegramBotUsername,
    telegramBotUrl:
      typeof raw.telegramBotUrl === "string" && raw.telegramBotUrl
        ? raw.telegramBotUrl
        : base.telegramBotUrl,
    telegramGroupUrl:
      typeof raw.telegramGroupUrl === "string" && raw.telegramGroupUrl
        ? raw.telegramGroupUrl
        : base.telegramGroupUrl,
    telegramMiniAppUrl:
      typeof raw.telegramMiniAppUrl === "string" && raw.telegramMiniAppUrl
        ? raw.telegramMiniAppUrl
        : base.telegramMiniAppUrl,
    showLiveStats: typeof raw.showLiveStats === "boolean" ? raw.showLiveStats : base.showLiveStats,
  };
}

export function subscribeSiteConfig(callback: (config: SiteConfig) => void): Unsubscribe {
  const fallback = defaultSiteConfig();
  if (!db || !isFirebaseConfigured) {
    callback(fallback);
    return () => {};
  }
  const r = ref(db, "siteConfig");
  return onValue(
    r,
    snap => {
      callback(mergeSiteConfig(snap.exists() ? (snap.val() as Partial<SiteConfig>) : null));
    },
    () => callback(fallback),
  );
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  if (!db || !isFirebaseConfigured) return defaultSiteConfig();
  const snap = await get(ref(db, "siteConfig"));
  return mergeSiteConfig(snap.exists() ? (snap.val() as Partial<SiteConfig>) : null);
}

/** Formulario de contacto → Realtime Database (sin Auth). */
export async function submitContactMessage(input: {
  name: string;
  email: string;
  message: string;
}): Promise<string> {
  if (!db || !isFirebaseConfigured) {
    throw new Error("Firebase Database no está configurado.");
  }
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Nombre inválido.");
  if (email.length < 5 || email.length > 120 || !email.includes("@")) {
    throw new Error("Correo inválido.");
  }
  if (message.length < 5 || message.length > 2000) throw new Error("Mensaje inválido.");

  const listRef = ref(db, "contactMessages");
  const itemRef = push(listRef);
  await set(itemRef, {
    name,
    email,
    message,
    createdAt: Date.now(),
    source: "landing",
  });
  return itemRef.key || "";
}

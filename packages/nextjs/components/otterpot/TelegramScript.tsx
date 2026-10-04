"use client";

import { useEffect } from "react";

function shouldLoadTelegramWebApp() {
  if (typeof window === "undefined") return false;
  if (window.Telegram?.WebApp?.initData) return true;
  if (/Telegram/i.test(navigator.userAgent)) return true;
  if (window.location.hash.includes("tgWebApp")) return true;
  if (window.location.search.includes("tgWebAppData")) return true;
  if (document.referrer.includes("telegram")) return true;
  return false;
}

/**
 * Solo carga telegram-web-app.js dentro de Telegram / Mini App.
 * En Chrome normal no se carga → sin spam de postEvent.
 */
export function TelegramScript() {
  useEffect(() => {
    if (!shouldLoadTelegramWebApp()) return;
    if (document.querySelector('script[data-otter-telegram-webapp="1"]')) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.dataset.otterTelegramWebapp = "1";
    document.head.appendChild(script);
  }, []);

  return null;
}

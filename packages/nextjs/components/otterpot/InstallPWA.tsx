"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Share, X } from "lucide-react";
import { Button } from "~~/components/otterpot/Button";
import { useTranslation } from "~~/lib/i18n";
import { cn } from "~~/utils/cn";

const DISMISS_KEY = "otterpot.pwa.dismiss";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

/**
 * Banner de instalación PWA — visible en pantalla (Chrome/Edge/Android + tip iOS).
 */
export function InstallPWA({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // ignore
    }

    if (isIos()) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Si el evento ya pasó o tarda, muestra tip genérico tras unos segundos
    const t = window.setTimeout(() => {
      setVisible(v => v || true);
    }, 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.clearTimeout(t);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  async function install() {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  if (!visible || isStandalone()) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[4.5rem] z-[45] px-3 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm lg:px-0",
        className,
      )}
    >
      <div className="flex gap-3 rounded-2xl border border-otter-border bg-otter-card/95 p-3 shadow-xl backdrop-blur-md sm:p-4">
        <Image
          src="/otter-logo.png"
          alt="OtterPot"
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold">{t("installPwa.title")}</p>
              <p className="mt-0.5 text-xs text-otter-muted">
                {iosHint
                  ? t("installPwa.ios")
                  : deferred
                    ? t("installPwa.prompt")
                    : t("installPwa.manual")}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg p-1 text-otter-muted hover:bg-otter-surface hover:text-otter-text"
              aria-label={t("installPwa.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {deferred ? (
              <Button size="sm" type="button" disabled={busy} onClick={() => void install()}>
                <Download className="h-3.5 w-3.5" />
                {busy ? t("installPwa.installing") : t("installPwa.install")}
              </Button>
            ) : iosHint ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-otter-border px-3 py-1.5 text-xs text-otter-muted">
                <Share className="h-3.5 w-3.5 text-otter-action" /> {t("installPwa.iosShort")}
              </span>
            ) : (
              <Button size="sm" type="button" variant="secondary" onClick={dismiss}>
                {t("installPwa.dismiss")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

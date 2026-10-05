"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Database } from "lucide-react";
import { subscribeChallenges } from "~~/services/firebase/challenges";
import { isFirebaseConfigured } from "~~/services/firebase/firebase.config";
import { useTranslation } from "~~/lib/i18n";
import { appConfig } from "~~/services/otterpot/config";
import type { Challenge } from "~~/types/challenge";

/** Datos en vivo desde Firebase RTDB — lectura pública de retos. */
export function LandingLiveStrip() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [ready, setReady] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setReady(true);
      return;
    }
    return subscribeChallenges(list => {
      setChallenges(list);
      setReady(true);
    });
  }, []);

  const active = useMemo(
    () => challenges.filter(c => c.status === "open" || c.status === "active" || c.status === "locked"),
    [challenges],
  );
  const recent = challenges.slice(0, 3);

  return (
    <section className="border-y border-otter-border bg-otter-surface py-6 sm:py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-otter-action" />
            <p className="text-sm font-semibold">
              {isFirebaseConfigured ? t("liveStrip.title") : t("liveStrip.unavailable")}
            </p>
          </div>
          <p className="text-[11px] text-otter-muted sm:text-xs">{appConfig.track}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
          <div className="rounded-2xl border border-otter-border bg-otter-card px-3 py-3 sm:px-5 sm:py-4">
            <p className="text-[10px] uppercase tracking-wider text-otter-muted sm:text-xs">{t("liveStrip.challenges")}</p>
            <p className="mt-1 text-xl font-bold text-otter-action sm:text-2xl">
              {ready ? challenges.length : "..."}
            </p>
          </div>
          <div className="rounded-2xl border border-otter-border bg-otter-card px-3 py-3 sm:px-5 sm:py-4">
            <p className="text-[10px] uppercase tracking-wider text-otter-muted sm:text-xs">{t("liveStrip.active")}</p>
            <p className="mt-1 text-xl font-bold text-otter-action sm:text-2xl">
              {ready ? active.length : "..."}
            </p>
          </div>
          <div className="rounded-2xl border border-otter-border bg-otter-card px-3 py-3 sm:px-5 sm:py-4">
            <p className="text-[10px] uppercase tracking-wider text-otter-muted sm:text-xs">{t("liveStrip.sync")}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold sm:text-sm">
              <Activity className="h-3.5 w-3.5 shrink-0 text-otter-action sm:h-4 sm:w-4" />
              <span className="truncate">
                {isFirebaseConfigured ? (ready ? t("liveStrip.ok") : "...") : t("liveStrip.off")}
              </span>
            </p>
          </div>
        </div>

        {recent.length ? (
          <ul className="mt-3 space-y-2 sm:mt-4">
            {recent.map(c => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-otter-border/80 bg-otter-bg/40 px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm"
              >
                <span className="truncate font-medium">{c.title}</span>
                <span className="shrink-0 text-[10px] text-otter-muted sm:text-xs">
                  {c.amount} {c.currency || "USDC"}
                  {" · "}
                  {c.onChainChallengeId ? t("liveStrip.onChain") : t("liveStrip.offChain")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

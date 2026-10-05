"use client";

import { useCallback, useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, Quote } from "lucide-react";
import { useTranslation } from "~~/lib/i18n";
import { cn } from "~~/utils/cn";

// Reseñas reales del jurado (texto original); la respuesta es del equipo.
const reviews = [
  { key: "antonella", name: "Antonella" },
  { key: "gianella", name: "Gianella Coronel" },
  { key: "alejandra", name: "Alejandra Catacora" },
] as const;

type ReviewKey = (typeof reviews)[number]["key"];

const AUTOPLAY_MS = 6000;
/** A partir de este largo la reseña se recorta y aparece "Leer más". */
const LONG_TEXT = 140;

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join("");
}

/** Slider de reseñas: avanza solo, se pausa con hover/foco y respeta reduced motion. */
export function ReviewsSlider() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<ReviewKey | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const count = reviews.length;

  const goTo = useCallback(
    (i: number) => {
      setIndex((i + count) % count);
      setExpanded(null);
    },
    [count],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // No avanza mientras alguien lee: hover, foco, reseña expandida o reduced motion.
  useEffect(() => {
    if (paused || expanded || reducedMotion) return;
    const id = window.setInterval(() => setIndex(i => (i + 1) % count), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, expanded, reducedMotion, count]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") goTo(index + 1);
    if (e.key === "ArrowLeft") goTo(index - 1);
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t("feedback.region")}
      className="mx-auto max-w-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <div className="overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live={paused ? "polite" : "off"}
        >
          {reviews.map(({ key, name }, i) => {
            const active = i === index;
            const quote = t(`feedback.items.${key}.quote`);
            const response = t(`feedback.items.${key}.response`);
            const isLong = quote.length > LONG_TEXT || response.length > LONG_TEXT;
            const isExpanded = expanded === key;
            return (
              <article
                key={key}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${count}`}
                aria-hidden={!active}
                inert={!active}
                className="flex w-full shrink-0 flex-col rounded-2xl border border-otter-border bg-otter-card p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-otter-action/15 text-sm font-bold text-otter-action">
                      {initials(name)}
                    </div>
                    <div>
                      <p className="my-0 text-sm font-semibold">{name}</p>
                      <p className="my-0 text-xs text-otter-muted">
                        {t("feedback.role")} · {t(`feedback.items.${key}.date`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["feedback.tagClarity", "feedback.tagUtility"] as const).map(tag => (
                      <span
                        key={tag}
                        className="rounded-full bg-otter-action/15 px-2.5 py-0.5 text-[11px] font-semibold text-otter-action"
                      >
                        {t(tag)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex gap-2.5">
                  <Quote className="mt-0.5 h-4 w-4 shrink-0 text-otter-action" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className={cn("my-0 text-sm leading-relaxed text-otter-text", isLong && !isExpanded && "line-clamp-3")}>
                      {quote}
                    </p>
                    {isLong ? (
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpanded(isExpanded ? null : key)}
                        className="mt-1 rounded-md text-xs font-semibold text-otter-action outline-none hover:underline focus-visible:ring-2 focus-visible:ring-otter-action"
                      >
                        {isExpanded ? t("feedback.readLess") : t("feedback.readMore")}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-auto pt-3">
                  <div className="rounded-xl border border-otter-border bg-otter-surface px-3 py-2.5">
                    <p className="my-0 flex items-center gap-1.5 text-xs font-semibold text-otter-action">
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t("feedback.responseLabel")}
                    </p>
                    <p className={cn("mb-0 mt-1 text-[13px] leading-relaxed text-otter-muted", isLong && !isExpanded && "line-clamp-2")}>{response}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label={t("feedback.prev")}
          className="rounded-full border border-otter-border p-2 text-otter-muted outline-none transition-colors hover:text-otter-text focus-visible:ring-2 focus-visible:ring-otter-action"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          {reviews.map(({ key }, i) => (
            <button
              key={key}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t("feedback.goTo", { n: i + 1 })}
              aria-current={i === index}
              className={cn(
                "h-2 rounded-full outline-none transition-all focus-visible:ring-2 focus-visible:ring-otter-action",
                i === index ? "w-6 bg-otter-action" : "w-2 bg-otter-border hover:bg-otter-muted",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label={t("feedback.next")}
          className="rounded-full border border-otter-border p-2 text-otter-muted outline-none transition-colors hover:text-otter-text focus-visible:ring-2 focus-visible:ring-otter-action"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

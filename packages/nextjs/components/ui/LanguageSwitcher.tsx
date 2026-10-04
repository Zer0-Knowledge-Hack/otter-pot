"use client";

import { Fragment } from "react";
import { locales, useTranslation } from "~~/lib/i18n";
import { cn } from "~~/utils/cn";

/** "ES | EN" con el mismo tono que los links del navbar. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("languageSwitcher.label")}
      className={cn("flex items-center gap-1 text-sm text-otter-muted", className)}
    >
      {locales.map((code, i) => {
        const active = code === locale;
        return (
          <Fragment key={code}>
            {i > 0 ? (
              <span aria-hidden="true" className="text-otter-border">
                |
              </span>
            ) : null}
            <button
              type="button"
              lang={code}
              aria-pressed={active}
              aria-label={t(`languageSwitcher.${code}`)}
              onClick={() => setLocale(code)}
              className={cn(
                "rounded-md px-1 py-0.5 font-semibold uppercase outline-none transition-colors hover:text-otter-text focus-visible:ring-2 focus-visible:ring-otter-action",
                active && "text-otter-action",
              )}
            >
              {code}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "~~/locales/en.json";
import es from "~~/locales/es.json";

export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];

type Messages = typeof es;

/** Rutas con puntos a cada string de `es.json`, p. ej. "hero.title". */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Messages>;
export type TranslationVars = Record<string, string | number>;

// El tipo `Messages` obliga a que en.json tenga todas las keys de es.json.
const dictionaries: Record<Locale, Messages> = { es, en };

const DEFAULT_LOCALE: Locale = "es";
const STORAGE_KEY = "otterpot-locale";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function detectBrowserLocale(): Locale {
  const lang = (navigator.languages?.[0] || navigator.language || "").toLowerCase();
  return lang.startsWith("en") ? "en" : DEFAULT_LOCALE;
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Idioma de la UI sin rutas /es /en: el export estático se renderiza en español y,
 * al montar, se aplica el idioma guardado o, si no hay, el del navegador.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(readStoredLocale() ?? detectBrowserLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sin storage (modo privado): el cambio vale solo para esta visita.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) =>
      interpolate(lookup(dictionaries[locale], key) ?? lookup(dictionaries[DEFAULT_LOCALE], key) ?? key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation debe usarse dentro de <I18nProvider>");
  return ctx;
}

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en } from "./en";
import { pl } from "./pl";
import type { Dictionary, Lang, MessageKey, Plural } from "./types";
import { uk } from "./uk";

export type { Lang, MessageKey } from "./types";

export const LANGS: { code: Lang; label: string; name: string; locale: string }[] = [
  { code: "pl", label: "PL", name: "Polski", locale: "pl-PL" },
  { code: "en", label: "EN", name: "English", locale: "en-GB" },
  { code: "uk", label: "UA", name: "Українська", locale: "uk-UA" },
];

const DICTS: Record<Lang, Dictionary> = { pl: pl as unknown as Dictionary, en, uk };
const STORAGE_KEY = "tw.lang";

type Params = Record<string, string | number>;

function isLang(v: unknown): v is Lang {
  return v === "pl" || v === "en" || v === "uk";
}

/** ?lang= wins (shareable links), then the saved choice, then the browser languages, then Polish. */
export function detectLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "ua") return "uk";
    if (isLang(q)) return q;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = l.toLowerCase().split("-")[0];
    if (base === "pl" || base === "en" || base === "uk") return base;
    if (base === "ru" || base === "be") return "uk";
  }
  return "pl";
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const msg = DICTS[lang][key] ?? DICTS.pl[key];
  if (typeof msg === "string") return interpolate(msg, params);
  const n = Number(params?.n ?? 0);
  const cat = new Intl.PluralRules(LANGS.find((l) => l.code === lang)!.locale).select(n) as keyof Plural;
  return interpolate(msg[cat] ?? msg.other, params);
}

export interface I18n {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: (key: MessageKey, params?: Params) => string;
  /** Translates a key built at runtime (e.g. "vehicle.<mode>"), falling back to `fallback`. */
  tx: (key: string, fallback: MessageKey, params?: Params) => string;
  fmt: {
    number: (n: number, digits?: number) => string;
    km: (metres: number) => string;
    weekdayShort: (dow: number) => string;
    weekdayLong: (dow: number) => string;
    dayMonth: (isoDate: string) => string;
    time: (iso: string, timeZone: string) => string;
  };
}

const Ctx = createContext<I18n | null>(null);

/** A Monday at noon UTC; ISO weekday d is this date + (d - 1) days. */
const MONDAY = Date.UTC(2024, 0, 1, 12);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const locale = LANGS.find((l) => l.code === lang)!.locale;

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.set("lang", l);
        history.replaceState(null, "", url);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const t = (key: MessageKey, params?: Params) => translate(lang, key, params);
    const wdShort = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    const wdLong = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    const dm = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", timeZone: "UTC" });
    const strip = (s: string) => s.replace(/\.$/, "");
    return {
      lang,
      locale,
      setLang,
      t,
      tx: (key, fallback, params) => (key in DICTS[lang] ? translate(lang, key as MessageKey, params) : t(fallback, params)),
      fmt: {
        number: (n, digits = 0) =>
          new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
        km: (m) => t("common.km", { n: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000) }),
        weekdayShort: (d) => strip(wdShort.format(new Date(MONDAY + (d - 1) * 86_400_000))),
        weekdayLong: (d) => wdLong.format(new Date(MONDAY + (d - 1) * 86_400_000)),
        dayMonth: (iso) => dm.format(new Date(`${iso}T12:00:00Z`)),
        time: (iso, timeZone) =>
          new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)),
      },
    };
  }, [lang, locale, setLang]);

  // Keep <html lang>, the title and the description in sync with the language.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = value.t("app.documentTitle");
    document.querySelector('meta[name="description"]')?.setAttribute("content", value.t("app.metaDescription"));
  }, [lang, value]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

/** Translates an API error body ({code, params}) or falls back to a generic network error. */
export function errorText(i18n: I18n, body: unknown, status: number): string {
  const b = body as { code?: string; params?: Params } | null;
  if (b?.code) return i18n.tx(`errors.${b.code}`, "errors.internal", b.params);
  return i18n.t("errors.network", { status });
}

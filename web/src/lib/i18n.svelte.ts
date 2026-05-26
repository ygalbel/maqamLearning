import { translations } from './data';
import type { Lang } from './types';

export const SUPPORTED_LANGS: Lang[] = ['en', 'he', 'ar'];

// Reactive global language state (Svelte 5 rune in a module).
export const i18n = $state<{ lang: Lang }>({ lang: 'en' });

export function isRtl(lang: Lang = i18n.lang): boolean {
  return lang === 'he' || lang === 'ar';
}

export function setLang(lang: Lang): void {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  if (i18n.lang !== lang) i18n.lang = lang;
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* ignore */
  }
}

export function storedLang(): Lang | null {
  try {
    const s = localStorage.getItem('lang') as Lang | null;
    return s && SUPPORTED_LANGS.includes(s) ? s : null;
  } catch {
    return null;
  }
}

function dict(lang: Lang): Record<string, unknown> {
  return (translations[lang] ?? translations.en ?? {}) as Record<string, unknown>;
}

/** Translate a flat key with `{var}` substitution; falls back to English then the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const d = dict(i18n.lang);
  const en = (translations.en ?? {}) as Record<string, unknown>;
  let str = (d[key] as string) ?? (en[key] as string) ?? key;
  if (typeof str !== 'string') str = key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export function maqamName(key: string): string {
  if (!key) return '';
  const d = dict(i18n.lang);
  const en = (translations.en ?? {}) as LangLike;
  return (d as LangLike).maqamNames?.[key] || en.maqamNames?.[key] || key;
}

export function jinsName(name: string): string {
  if (!name) return '';
  const d = dict(i18n.lang) as LangLike;
  const en = (translations.en ?? {}) as LangLike;
  return d.jinsNames?.[name] || en.jinsNames?.[name] || name;
}

type LangLike = {
  maqamNames?: Record<string, string>;
  jinsNames?: Record<string, string>;
};

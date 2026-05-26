import { SUPPORTED_LANGS, setLang, i18n } from './i18n.svelte';
import type { Lang } from './types';

export type Page = 'list' | 'maqam' | 'exercises' | 'quiz' | 'looper';

export interface Route {
  page: Page;
  maqam?: string;
  lang: Lang;
}

export const router = $state<{ route: Route }>({
  route: { page: 'list', lang: 'en' },
});

function splitHash(): { lang: Lang | null; parts: string[] } {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let lang: Lang | null = null;
  if (parts.length > 0 && (SUPPORTED_LANGS as string[]).includes(parts[0])) {
    lang = parts.shift() as Lang;
  }
  return { lang, parts };
}

export function parseRoute(): Route {
  const { lang, parts } = splitHash();
  const resolvedLang: Lang = lang ?? 'en';
  if (parts.length === 0) return { page: 'list', lang: resolvedLang };
  if (parts[0] === 'exercises') return { page: 'exercises', lang: resolvedLang };
  if (parts[0] === 'quiz') return { page: 'quiz', lang: resolvedLang };
  if (parts[0] === 'looper') return { page: 'looper', lang: resolvedLang };
  if (parts[0] === 'maqam' && parts[1]) return { page: 'maqam', maqam: parts[1], lang: resolvedLang };
  return { page: 'list', lang: resolvedLang };
}

export function currentPath(): string {
  const { parts } = splitHash();
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

export function buildLangHash(lang: Lang, path = ''): string {
  const prefix = lang === 'en' ? '' : `/${lang}`;
  if (!path) return `#${prefix || '/'}`;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `#${prefix}${clean}`;
}

export function buildHash(path = ''): string {
  return buildLangHash(i18n.lang, path);
}

/** Path (without lang prefix) for a given route — used to build language-switch links. */
export function routePath(r: Route): string {
  if (r.page === 'maqam' && r.maqam) return `/maqam/${r.maqam}`;
  if (r.page === 'list') return '/';
  return `/${r.page}`;
}

function update(): void {
  const route = parseRoute();
  router.route = route;
  setLang(route.lang);
}

export function startRouter(): void {
  window.addEventListener('hashchange', update);
  update();
}

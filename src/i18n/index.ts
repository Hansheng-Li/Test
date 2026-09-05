import { ZH } from './zh';

export type Lang = 'zh' | 'en';

let current: Lang = 'zh';

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

export function getLang(): Lang {
  return current;
}

/**
 * Translate a string written in English. Keys are the English source text; the Chinese
 * dictionary maps them. `{name}` placeholders are filled from `vars` in either language, so
 * a missing translation still renders correctly in English.
 */
export type Vars = Record<string, string | number | null | undefined>;

export function t(en: string, vars?: Vars): string {
  const s = current === 'zh' ? (ZH[en] ?? en) : en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m)) : s;
}

/** Look up a display name for game data (items, effects, places, customers' jobs) without a fallback warning. */
export function tn(en: string): string {
  return current === 'zh' ? (ZH[en] ?? en) : en;
}

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

const missing = new Set<string>();
/** English keys shown while the UI was Chinese (for translation audits). */
export function missingTranslations(): string[] {
  return Array.from(missing);
}

export function t(en: string, vars?: Vars): string {
  if (current === 'zh' && !(en in ZH)) missing.add(en);
  const s = current === 'zh' ? (ZH[en] ?? en) : en;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m)) : s;
}

/** Look up a display name for game data (items, effects, places, customers' jobs) without a fallback warning. */
export function tn(en: string): string {
  if (current === 'zh' && !(en in ZH)) missing.add(en);
  return current === 'zh' ? (ZH[en] ?? en) : en;
}

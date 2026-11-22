/// <reference types="vite/client" />
// Tiny i18n: typed keys from ru.json, plurals via Intl.PluralRules, content texts with fallback to ru.
import ru from '../../locales/ru.json';
import en from '../../locales/en.json';
import type { LocaleTexts } from '../model/content';

export type Lang = 'ru' | 'en';
export type Key = keyof typeof ru;
type Entry = string | Partial<Record<Intl.LDMLPluralRule, string>>;

const dict: Record<Lang, Record<string, Entry>> = { ru, en };
export const LANGS: Lang[] = ['ru', 'en'];
export const FALLBACK: Lang = 'ru';

/** First supported language of the system locale list, else ru. */
export function detectLang(langs: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): Lang {
  for (const l of langs) {
    const code = l.slice(0, 2).toLowerCase();
    if (code === 'ru' || code === 'en') return code;
  }
  return FALLBACK;
}

let lang: Lang = detectLang();
export const getLang = () => lang;
export const setLang = (l: Lang) => {
  lang = l;
};

/** t('count.stress', { n: 5 }) -> "5 стрессов". A key missing in the language falls back to ru. */
export function t(key: Key, vars: Record<string, string | number> = {}, l: Lang = lang): string {
  let e: Entry | undefined = dict[l][key] ?? dict[FALLBACK][key];
  if (typeof e === 'object') e = e[new Intl.PluralRules(l).select(Number(vars.n))] ?? e.other ?? '';
  return (e ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// content/<lang>/{common,playbooks/*}.json, kept per file: some ids repeat across files
// (e.g. action "tinker" vs Leech talent "tinker"), so lookup takes an optional scope.
const files = import.meta.glob<LocaleTexts>('../../content/*/{common,playbooks/*}.json', { eager: true, import: 'default' });
const texts: Record<string, Record<string, LocaleTexts>> = {};
for (const [path, data] of Object.entries(files)) {
  const [code, file] = path.split('/content/')[1].replace(/\.json$/, '').split(/\/(.+)/);
  (texts[code] ??= {})[file.replace('playbooks/', '')] = data;
}

/** Book entity text by id. `scope` is 'common' or a playbook id; without it common is searched first. Falls back to ru. */
export function contentText(l: Lang | string, id: string, scope?: string) {
  for (const code of [l, FALLBACK]) {
    const byFile = texts[code] ?? {};
    const hit = scope ? byFile[scope]?.[id] : (byFile.common?.[id] ?? Object.values(byFile).find((f) => id in f)?.[id]);
    if (hit) return hit;
  }
}

import type { Character, Item, TableRules, TalentMods } from '../model';

export const BOOK_LOAD = { light: 3, normal: 5, heavy: 6 } as const; // p. 72

/** Load carried: per-piece load x pieces on you, gear only (workshop never counts). */
export const loadUsed = (items: Item[]): number =>
  items.reduce((s, i) => s + (i.place === 'gear' ? i.load * i.carried : 0), 0);

/** Limit of the chosen load level; talent mods (Mule: 5/7/8) raise it. null = load not counted (rules.load off). */
export function loadLimit(level: Character['load'], rules: TableRules, mods: TalentMods[]): number | null {
  if (!rules.load) return null;
  return Math.max(BOOK_LOAD[level], ...mods.map(m => m.load?.[level] ?? 0));
}

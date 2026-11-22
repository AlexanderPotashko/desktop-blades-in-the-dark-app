import type { TableRules, TableRulesOverride } from '../model';

/** Campaign rules with a sheet's override on top (top-level groups replace whole). */
export const resolveRules = (base: TableRules, override?: TableRulesOverride): TableRules =>
  ({ ...base, ...override }) as TableRules;

/** Mode 'book' forces every official mechanic on; custom values are kept for when the mode flips back. */
export function effectiveRules(r: TableRules): TableRules {
  if (r.mode !== 'book') return r;
  return {
    ...r,
    money: { ...r.money, book: true },
    stress: { ...r.stress, book: true },
    playbookXpBoxes: 8,
    specialArmor: 'shared',
    load: true,
    bandolier: 'book',
    presets: 'book',
    dayCounter: false,
    downtime: { ...r.downtime, book: true },
    foreignTalentCost: 1,
  };
}

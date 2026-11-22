import type { TableRules, TalentMods } from '../model';

/** Stress boxes: book 9 (or the playbook's) + talent mods such as Survivor, or the table's own count. */
export const stressMax = (rules: TableRules, mods: TalentMods[], playbookBoxes = 9): number =>
  rules.stress.book ? playbookBoxes + mods.reduce((s, m) => s + (m.stressBoxes ?? 0), 0) : rules.stress.boxes;

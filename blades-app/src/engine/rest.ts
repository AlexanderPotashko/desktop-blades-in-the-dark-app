import type { Character, CounterReset, DowntimeOption } from '../model';

export type RestKind = 'day' | 'downtime' | 'score';

const RESETS: Record<RestKind, CounterReset[]> = { day: ['day'], downtime: ['day', 'downtime'], score: ['score'] };

/** New document plus what was reset (counter ids with a value, special-armor talents, armor). */
export interface RestResult { doc: Character; counters: string[]; specialArmor: string[]; armor: boolean }

/**
 * New day: +1 day, day counters. Downtime: day + downtime counters, special armor.
 * New score: score counters, armor boxes (load is chosen anew).
 */
export function rest(doc: Character, kind: RestKind): RestResult {
  const kinds = RESETS[kind];
  const counters = doc.counters.filter(c => kinds.includes(c.reset) && c.value > 0).map(c => c.id);
  const specialArmor = kind === 'downtime' ? Object.keys(doc.specialArmorUsed).filter(k => doc.specialArmorUsed[k]) : [];
  const armor = kind === 'score' && Object.values(doc.armorUsed).some(Boolean);
  return {
    doc: {
      ...doc,
      day: kind === 'day' ? doc.day + 1 : doc.day,
      counters: doc.counters.map(c => (kinds.includes(c.reset) ? { ...c, value: 0 } : c)),
      specialArmorUsed: kind === 'downtime' ? {} : doc.specialArmorUsed,
      armorUsed: kind === 'score' ? {} : doc.armorUsed,
    },
    counters, specialArmor, armor,
  };
}

/** The table's downtime choice (e.g. +1 healing −1 stress). Healing clock caps at 4. */
export const applyDowntimeOption = (doc: Character, o: DowntimeOption): Character =>
  ({ ...doc, healing: Math.min(4, doc.healing + o.healing), stress: Math.max(0, doc.stress - o.stressRelief) });

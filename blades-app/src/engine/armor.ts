import type { Character, TableRules } from '../model';
import { specialArmorTalents, type TalentDefs } from './talents';

export interface ArmorRow { itemId: string; boxes: number; used: number }

/** Armor boxes from every carried gear item that has them (book Armor/Heavy: 1 each unless overridden). */
export function armorAvailable(doc: Character, bookArmor: Record<string, number | undefined>): ArmorRow[] {
  return doc.items.flatMap(i => {
    const boxes = i.props.armor ?? (i.bookId ? bookArmor[i.bookId] ?? 0 : 0);
    if (i.place !== 'gear' || i.carried < 1 || boxes < 1) return [];
    return [{ itemId: i.id, boxes, used: Math.min(doc.armorUsed[i.id] ?? 0, boxes) }];
  });
}

export interface SpecialArmorBox { talents: string[]; used: boolean; shared: boolean }

/** Book: one box covering every special-armor talent (p. 68); house rule: one box per talent. */
export function specialArmor(doc: Character, defs: TalentDefs, rules: Pick<TableRules, 'specialArmor'>): SpecialArmorBox[] {
  const talents = specialArmorTalents(doc, defs);
  if (!talents.length) return [];
  if (rules.specialArmor === 'per-talent') return talents.map(t => ({ talents: [t], used: !!doc.specialArmorUsed[t], shared: false }));
  return [{ talents, used: doc.specialArmorShared, shared: true }];
}

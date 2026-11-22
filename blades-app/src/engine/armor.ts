import type { Character } from '../model';
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

/** Special-armor checkboxes: one per taken talent that has it. */
export const specialArmor = (doc: Character, defs: TalentDefs): { talent: string; used: boolean }[] =>
  specialArmorTalents(doc, defs).map(talent => ({ talent, used: !!doc.specialArmorUsed[talent] }));

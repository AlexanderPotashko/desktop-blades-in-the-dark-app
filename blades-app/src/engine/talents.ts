import type { Character, Playbook, Talent, TalentMods } from '../model';

export type TalentDefs = Record<string, Talent>;

/** Book talents of all playbooks by id (owner filled from the playbook). */
export const indexTalents = (playbooks: Playbook[]): TalentDefs =>
  Object.fromEntries(playbooks.flatMap(p => p.talents.map(t => [t.id, { ...t, owner: t.owner ?? p.id }])));

/** Engine mods of every taken talent, book and custom alike. */
export const talentMods = (doc: Character, defs: TalentDefs): TalentMods[] =>
  [...doc.talents.map(id => defs[id]?.mods), ...doc.customTalents.map(t => t.mods)].filter((m): m is TalentMods => !!m);

/** Taken talents that give a special-armor checkbox. */
export const specialArmorTalents = (doc: Character, defs: TalentDefs): string[] =>
  [...doc.talents.filter(id => defs[id]?.specialArmor), ...doc.customTalents.filter(t => t.specialArmor).map(t => t.id)];

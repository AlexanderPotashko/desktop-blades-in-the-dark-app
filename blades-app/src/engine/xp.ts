import type { TableRules } from '../model';
import type { TalentDefs } from './talents';

export type XpTrack = 'insight' | 'prowess' | 'resolve' | 'playbook';

/** Boxes of an XP track: attributes 6, playbook from the rules (book 8). */
export const xpMax = (track: XpTrack, rules: TableRules): number => (track === 'playbook' ? rules.playbookXpBoxes : 6);

/** Advances a talent costs: another playbook's talent costs `foreignTalentCost`; custom ones are never foreign. */
export function talentCost(talent: string, playbookId: string, defs: TalentDefs, rules: TableRules): number {
  const owner = defs[talent]?.owner;
  return owner && owner !== playbookId ? rules.foreignTalentCost : 1;
}

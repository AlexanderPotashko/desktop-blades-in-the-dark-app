// Creation wizard rules (pp. 66-72), kept apart from the UI so they can be tested.
// "book": playbook's starting dots + 4 free, max 2 each, 1 talent of the playbook.
// "running" (joined a running game): the table's own totals; foreign talents cost `foreignCost`.
import { BOOK_RULES, Character, type Origin, type Playbook } from '../model';
import { attributes } from '../engine/attributes';
import { newCharacter, presets } from '../store/actions';
import { actionDefs, commonContent, playbooks, talentDefs } from '../store/content';

export type Mode = 'book' | 'running';
export interface Limits { dots: number; maxRating: number; talents: number; foreignCost: 1 | 2 }
export interface WizContact { bookId?: string; name?: string; note: string }
export interface CustomTalentDraft { name: string; text: string }

export interface Draft {
  playbookId: string;
  mode: Mode;
  limits: Limits; // only edited in "running"; in "book" derived by `bookLimits`
  buildId?: string;
  actions: Record<string, number>; // full ratings, starting dots included
  talents: string[]; // book talent ids (own or foreign)
  customTalents: CustomTalentDraft[];
  heritage: Origin;
  background: Origin;
  vice: Origin;
  friend: WizContact | null;
  rival: WizContact | null;
  name: string;
  alias: string;
  look: string;
}

export const startingDots = (pb: Playbook) => Object.values(pb.startingActions).reduce((s, v) => s + v, 0);
export const bookLimits = (pb: Playbook): Limits => ({
  dots: startingDots(pb) + commonContent.creation.freeActionDots,
  maxRating: commonContent.creation.maxRatingAtCreation,
  talents: commonContent.creation.talents,
  foreignCost: 1,
});
/** The player's real case: 14 dots in all, rating up to 4, 3 talents, a foreign talent costs 2. */
export const RUNNING_DEFAULTS: Limits = { dots: 14, maxRating: 4, talents: 3, foreignCost: 2 };

export const activeLimits = (d: Draft): Limits => (d.mode === 'book' ? bookLimits(playbooks[d.playbookId]) : d.limits);

const baseActions = (pb: Playbook): Record<string, number> => ({ ...Object.fromEntries(actionDefs.map((a) => [a.id, 0])), ...pb.startingActions });

export const talentCost = (d: Draft, id: string): number =>
  talentDefs[id]?.owner === d.playbookId ? 1 : activeLimits(d).foreignCost;
export const talentsUsed = (d: Draft) => d.talents.reduce((s, id) => s + talentCost(d, id), 0) + d.customTalents.length;
export const dotsUsed = (d: Draft) => Object.values(d.actions).reduce((s, v) => s + v, 0);

/** Pulls a draft back inside the limits after they (or the mode) changed. */
export function clamp(d: Draft): Draft {
  const pb = playbooks[d.playbookId], l = activeLimits(d);
  const floor = (a: string) => pb.startingActions[a] ?? 0;
  const actions = { ...d.actions };
  for (const a of Object.keys(actions)) actions[a] = Math.max(floor(a), Math.min(actions[a], l.maxRating));
  let used = Object.values(actions).reduce((s, v) => s + v, 0);
  for (const a of Object.keys(actions).reverse()) {
    while (used > l.dots && actions[a] > floor(a)) (actions[a]--, used--);
  }
  let out: Draft = { ...d, actions };
  while (talentsUsed(out) > l.talents && (out.customTalents.length || out.talents.length)) {
    out = out.customTalents.length ? { ...out, customTalents: out.customTalents.slice(0, -1) } : { ...out, talents: out.talents.slice(0, -1) };
  }
  return out;
}

/** Pre-fills dots and talent from a ready-made kit of the playbook (undefined = back to the bare playbook). */
export function applyBuild(d: Draft, buildId: string | undefined): Draft {
  const pb = playbooks[d.playbookId];
  const b = pb.builds.find((x) => x.id === buildId);
  const actions = baseActions(pb);
  for (const [k, v] of Object.entries(b?.actions ?? {})) actions[k] += v;
  const own = new Set(pb.talents.map((x) => x.id));
  const kept = d.talents.filter((id) => !own.has(id)); // foreign ones survive a build switch
  return clamp({ ...d, buildId: b?.id, actions, talents: b ? [b.talent, ...kept] : kept });
}

export function newDraft(playbookId: string, mode: Mode = 'book'): Draft {
  return {
    playbookId, mode, limits: { ...RUNNING_DEFAULTS }, actions: baseActions(playbooks[playbookId]), talents: [], customTalents: [],
    heritage: { note: '' }, background: { note: '' }, vice: { note: '' }, friend: null, rival: null, name: '', alias: '', look: '',
  };
}

/** Sets one action's rating inside the limits: not below the playbook's start, not above the max or the dots left. */
export function setDot(d: Draft, action: string, v: number): Draft {
  const l = activeLimits(d);
  const floor = playbooks[d.playbookId].startingActions[action] ?? 0;
  const room = l.dots - (dotsUsed(d) - d.actions[action]);
  return { ...d, actions: { ...d.actions, [action]: Math.max(floor, Math.min(v, l.maxRating, room)) } };
}

export const setMode = (d: Draft, mode: Mode): Draft => applyBuild({ ...d, mode, talents: [], customTalents: [] }, d.buildId);
export const setLimits = (d: Draft, p: Partial<Limits>): Draft => clamp({ ...d, limits: { ...d.limits, ...p } });
export const setPlaybook = (d: Draft, playbookId: string): Draft => ({ ...newDraft(playbookId, d.mode), limits: d.limits, name: d.name, alias: d.alias, look: d.look });

/** Can this book talent be added now? Book mode: own playbook only. */
export const canAddTalent = (d: Draft, id: string) =>
  !d.talents.includes(id) && talentsUsed(d) + talentCost(d, id) <= activeLimits(d).talents
  && (d.mode === 'running' || talentDefs[id]?.owner === d.playbookId);

export const attributesOf = (d: Draft) => attributes(d.actions, actionDefs);

/** The sheet: Zod-valid, with the playbook's special items and the preset counters of the talents. */
export function buildCharacter(d: Draft): Character {
  const base = newCharacter(d.playbookId);
  const l = activeLimits(d);
  const contacts = [d.friend && { ...d.friend, rel: 'up' as const }, d.rival && { ...d.rival, rel: 'down' as const }]
    .filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({ id: crypto.randomUUID(), ...c }));
  const customTalents = d.customTalents.filter((c) => c.name.trim()).map((c) => ({ id: crypto.randomUUID(), name: c.name.trim(), text: c.text, specialArmor: false }));
  const draft = Character.parse({ ...base, name: d.name.trim(), alias: d.alias.trim(), look: d.look, actions: d.actions, talents: d.talents, customTalents, heritage: d.heritage, background: d.background, vice: d.vice, contacts });
  const ps = presets(draft, BOOK_RULES);
  const counters = ps.map(({ talent, preset }) => ({ id: crypto.randomUUID(), name: preset.name, value: 0, max: preset.max, reset: preset.reset, fromTalent: talent, ...(preset.hint ? { hint: preset.hint } : {}) }));
  // foreign talents at a custom price need the sheet's own rules; the stage follows the highest rating allowed
  const rulesOverride = d.mode === 'running'
    ? { mode: 'custom' as const, skillStage: l.maxRating >= 4 ? 'mastery' as const : 'play' as const, foreignTalentCost: l.foreignCost }
    : undefined;
  return Character.parse({ ...draft, counters, presetsApplied: ps.map((p) => p.talent), ...(rulesOverride && { rulesOverride }) });
}

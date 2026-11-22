// Sheet edits as named functions: the one place UI handlers go through (and, later, the agent API mirrors them).
import { arrayMove } from '@dnd-kit/sortable';
import { Character, type Counter, type CounterPreset, type DowntimeOption, type TableRules } from '../model';
import { rest, type RestKind, type RestResult } from '../engine/rest';
import { contentText, getLang, t } from '../i18n';
import { actionDefs, playbooks, talentDefs } from './content';
import { useStore } from './store';

const edit = (...a: Parameters<ReturnType<typeof useStore.getState>['edit']>) => useStore.getState().edit(...a);
const uuid = () => crypto.randomUUID();

/** Blank sheet of a playbook: its starting action dots and special items. `withBuild`: the first ready-made kit (talent and dots). */
export function newCharacter(playbookId: string, opts: { withBuild?: boolean; name?: string } = {}): Character {
  const pb = playbooks[playbookId];
  if (!pb) throw new Error(`unknown playbook ${playbookId}`);
  const build = opts.withBuild ? pb.builds[0] : undefined;
  const actions = Object.fromEntries(actionDefs.map((a) => [a.id, 0]));
  for (const [k, v] of Object.entries({ ...pb.startingActions })) actions[k] = v;
  for (const [k, v] of Object.entries(build?.actions ?? {})) actions[k] = (actions[k] ?? 0) + v;
  return Character.parse({
    id: uuid(),
    schemaVersion: 1,
    playbookId,
    name: opts.name ?? '',
    actions,
    talents: build ? [build.talent] : [],
    load: 'normal',
    items: pb.items.map((i) => ({ id: uuid(), bookId: i.id, load: i.load, carried: 1 })),
  });
}

// ---- presets: counters a talent brings (book: from content, own: the table's `talentPresets`, custom talents)

export interface Preset { talent: string; preset: CounterPreset }

function bookPreset(id: string, rules: TableRules): CounterPreset | undefined {
  const own = rules.presets === 'book+own' ? rules.talentPresets[id] : undefined;
  const c = talentDefs[id]?.counter;
  const txt = contentText(getLang(), id)?.counter;
  return own ?? (c ? { name: txt?.name ?? id, max: c.max, reset: c.reset, hint: txt?.hint } : undefined);
}
export function presets(doc: Character, rules: TableRules): Preset[] {
  const out: Preset[] = [];
  for (const id of doc.talents) {
    const preset = bookPreset(id, rules);
    if (preset) out.push({ talent: id, preset });
  }
  for (const ct of doc.customTalents) if (ct.counter) out.push({ talent: ct.id, preset: ct.counter });
  return out;
}
const counterOf = (talent: string, p: CounterPreset): Counter => ({
  id: uuid(), name: p.name, value: 0, max: p.max, reset: p.reset, fromTalent: talent, ...(p.hint ? { hint: p.hint } : {}),
});

// ---- identity
export const setField = (k: 'name' | 'alias', v: string) => edit((d) => void (d[k] = v), k);
export const setDay = (n: number) => edit((d) => void (d.day = Math.max(1, Math.floor(n) || 1)), 'day');

// ---- actions and xp
export const setAction = (id: string, v: number) => edit((d) => void (d.actions[id] = Math.max(0, Math.min(4, v))));
export const setXp = (track: 'insight' | 'prowess' | 'resolve' | 'playbook', v: number) => edit((d) => void (d.xp[track] = v));

// ---- talents
export function addTalent(id: string, rules: TableRules) {
  edit((d) => {
    if (d.talents.includes(id)) return;
    d.talents.push(id);
    const p = bookPreset(id, rules);
    if (p && !d.presetsApplied.includes(id)) {
      d.presetsApplied.push(id);
      d.counters.push(counterOf(id, p));
    }
  });
}
export const removeTalent = (id: string) =>
  edit((d) => {
    d.talents = d.talents.filter((x) => x !== id);
    delete d.specialArmorUsed[id];
  });
export const addCustomTalent = () => edit((d) => void d.customTalents.push({ id: uuid(), name: '', text: '', specialArmor: false }));
export const setCustomTalent = (id: string, patch: { name?: string; text?: string; specialArmor?: boolean }) =>
  edit((d) => {
    const c = d.customTalents.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  }, `ct:${id}:${Object.keys(patch)[0]}`);
export const removeCustomTalent = (id: string) =>
  edit((d) => {
    d.customTalents = d.customTalents.filter((x) => x.id !== id);
    delete d.specialArmorUsed[id];
  });

// ---- stress, trauma, harm
export const setStress = (v: number) => edit((d) => void (d.stress = v));
export const toggleTrauma = (id: string) =>
  edit((d) => {
    const i = d.trauma.indexOf(id);
    if (i >= 0) d.trauma.splice(i, 1);
    else d.trauma.push(id);
  });
export const addCustomTrauma = (name: string) => {
  const n = name.trim();
  if (!n) return;
  edit((d) => {
    const id = uuid();
    d.customTraumas.push({ id, name: n, text: '' });
    d.trauma.push(id);
  });
};
export const removeCustomTrauma = (id: string) =>
  edit((d) => {
    d.customTraumas = d.customTraumas.filter((x) => x.id !== id);
    d.trauma = d.trauma.filter((x) => x !== id);
  });
export const setHarm = (row: 'l3' | 'l2' | 'l1', i: number, v: string) =>
  edit((d) => void (row === 'l3' ? (d.harm.l3 = v) : (d.harm[row][i] = v)), `harm:${row}${i}`);
export const setHealing = (v: number) => edit((d) => void (d.healing = Math.max(0, Math.min(4, v))));

// ---- protection
export const setArmorUsed = (itemId: string, n: number) => edit((d) => void (d.armorUsed[itemId] = n));
export const toggleSpecialArmor = (talent: string | null) =>
  edit((d) => {
    if (talent === null) d.specialArmorShared = !d.specialArmorShared;
    else d.specialArmorUsed[talent] = !d.specialArmorUsed[talent];
  });

// ---- counters
export const addCounter = (preset?: Preset) =>
  edit((d) => void d.counters.push(preset ? counterOf(preset.talent, preset.preset) : { id: uuid(), name: '', value: 0, reset: 'manual' }));
export const bumpCounter = (id: string, delta: number) =>
  edit((d) => {
    const c = d.counters.find((x) => x.id === id);
    if (c) c.value = Math.max(0, Math.min(c.max ?? Infinity, c.value + delta));
  });
export const setCounterValue = (id: string, v: number) =>
  edit((d) => {
    const c = d.counters.find((x) => x.id === id);
    if (c) c.value = Math.max(0, Math.min(c.max ?? Infinity, v));
  });
export const setCounter = (id: string, patch: { name?: string; max?: number | undefined; reset?: Counter['reset'] }) =>
  edit((d) => {
    const c = d.counters.find((x) => x.id === id);
    if (!c) return;
    if ('max' in patch) {
      if (patch.max === undefined) delete c.max;
      else c.max = patch.max;
    }
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.reset) c.reset = patch.reset;
    if (c.max !== undefined && c.value > c.max) c.value = c.max;
  }, `ctr:${id}:${Object.keys(patch)[0]}`);
export const removeCounter = (id: string) => edit((d) => void (d.counters = d.counters.filter((c) => c.id !== id)));
export const moveCounter = (from: string, to: string) =>
  edit((d) => {
    const a = d.counters.findIndex((c) => c.id === from), b = d.counters.findIndex((c) => c.id === to);
    if (a >= 0 && b >= 0 && a !== b) d.counters = arrayMove(d.counters, a, b);
  });

// ---- rest
/** Applies the rest to the open sheet and returns what was reset (for the message under the buttons). */
export function applyRest(kind: RestKind): RestResult | undefined {
  const doc = useStore.getState().doc;
  if (!doc) return;
  const r = rest(doc, kind);
  edit((d) => void Object.assign(d, r.doc));
  return r;
}
export const applyDowntime = (o: DowntimeOption) =>
  edit((d) => {
    d.healing = Math.min(4, d.healing + o.healing);
    d.stress = Math.max(0, d.stress - o.stressRelief);
  });

// ---- rules (sheet-level override over the campaign/book rules)
export const setRule = <K extends keyof TableRules>(key: K, value: TableRules[K]) =>
  edit((d) => void (d.rulesOverride = { ...d.rulesOverride, [key]: value }), `rule:${key}`);
/** Name of a taken talent (book or custom). */
export const talentName = (doc: Character, id: string): string =>
  doc.customTalents.find((c) => c.id === id)?.name || contentText(getLang(), id)?.name || id;
/** Item name: rename, else localized book name. */
export const itemName = (i: Character['items'][number]): string =>
  i.name ?? (i.bookId ? contentText(getLang(), i.bookId)?.name ?? i.bookId : t('item.unnamed'));

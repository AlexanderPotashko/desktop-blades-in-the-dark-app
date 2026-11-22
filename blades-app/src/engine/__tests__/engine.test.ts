import { describe, expect, it } from 'vitest';
import { BOOK_RULES, Character, type Action, type CharacterInput, type Playbook, type TableRules } from '../../model';
import { armorAvailable, specialArmor } from '../armor';
import { attributes } from '../attributes';
import { loadLimit, loadUsed } from '../load';
import { breakMajor, joinMinor, toMajor, toMinor, totalMinor } from '../money';
import { applyDowntimeOption, rest } from '../rest';
import { effectiveRules, resolveRules } from '../rules';
import { stageCheck } from '../stage';
import { stressMax } from '../stress';
import { indexTalents, talentMods } from '../talents';
import { talentCost, xpMax } from '../xp';

const id = () => crypto.randomUUID();

const ACTIONS: Action[] = [
  ['study', 'insight'], ['hunt', 'insight'], ['survey', 'insight'], ['tinker', 'insight'],
  ['skirmish', 'prowess'], ['prowl', 'prowess'], ['wreck', 'prowess'], ['finesse', 'prowess'],
  ['sway', 'resolve'], ['consort', 'resolve'], ['command', 'resolve'], ['attune', 'resolve'],
].map(([id, attribute]) => ({ id, attribute }) as Action);

const pb = (pid: string, talents: Playbook['talents']): Playbook =>
  ({ id: pid, kind: 'standard', startingActions: {}, talents, items: [], friends: [], builds: [] });
const DEFS = indexTalents([
  pb('leech', [
    { id: 'fortitude', group: 'ability', specialArmor: true },
    { id: 'physicker', group: 'ability', specialArmor: false },
  ]),
  pb('cutter', [{ id: 'mule', group: 'ability', specialArmor: false, mods: { load: { light: 5, normal: 7, heavy: 8 } } }]),
  pb('hound', [{ id: 'survivor', group: 'ability', specialArmor: false, mods: { stressBoxes: 1 } }]),
]);

const custom: TableRules = {
  ...BOOK_RULES, mode: 'custom',
  money: { book: false, major: 'Драхмы', minor: 'Драхмёныши', rate: 20 },
  stress: { book: false, boxes: 12 },
  playbookXpBoxes: 16, specialArmor: 'per-talent', load: false, bandolier: 'own-items', presets: 'book+own', dayCounter: true,
  downtime: { book: false, options: [{ id: id(), name: '+1 лечение, −1 стресс', healing: 1, stressRelief: 1 }] },
  skillStage: 'free', crewTier: 2, foreignTalentCost: 2,
};

const doc = (over: Partial<CharacterInput> = {}): Character =>
  Character.parse({ id: id(), schemaVersion: 1, playbookId: 'leech', actions: {}, ...over });

describe('rules', () => {
  it('book mode forces every official mechanic on and keeps custom values', () => {
    const r = effectiveRules({ ...custom, mode: 'book' });
    expect(r.money).toEqual({ book: true, major: 'Драхмы', minor: 'Драхмёныши', rate: 20 });
    expect(r.stress).toEqual({ book: true, boxes: 12 });
    expect(r).toMatchObject({ playbookXpBoxes: 8, load: true, bandolier: 'book', presets: 'book', dayCounter: false, foreignTalentCost: 1 });
    expect(r.downtime.book).toBe(true);
    expect(r.downtime.options).toHaveLength(1);
    expect(r).toMatchObject({ skillStage: 'free', crewTier: 2 }); // not official toggles
  });
  it('custom mode is returned as is', () => expect(effectiveRules(custom)).toBe(custom));
  it('sheet override replaces whole top-level groups', () => {
    const r = resolveRules(custom, { stress: { book: true, boxes: 9 }, crewTier: 4 });
    expect(r.stress).toEqual({ book: true, boxes: 9 });
    expect(r.crewTier).toBe(4);
    expect(r.money).toBe(custom.money);
    expect(resolveRules(custom)).toEqual(custom);
  });
});

describe('attributes', () => {
  it('counts actions rated 1+ per attribute (the reference Leech: 4/3/2)', () => {
    const a = { tinker: 4, study: 2, survey: 1, hunt: 1, wreck: 2, prowl: 1, finesse: 1, skirmish: 0, consort: 1, attune: 1, command: 0, sway: 0 };
    expect(attributes(a, ACTIONS)).toEqual({ insight: 4, prowess: 3, resolve: 2 });
  });
  it('missing actions count as 0', () => expect(attributes({ tinker: 2 }, ACTIONS)).toEqual({ insight: 1, prowess: 0, resolve: 0 }));
});

describe('stage limits', () => {
  it('creation: 7 dots, max 2', () => {
    expect(stageCheck({ tinker: 2, wreck: 1, study: 2, prowl: 2 }, 'creation')).toEqual({ cap: 2, points: 7, maxPoints: 7, over: [], ok: true });
    expect(stageCheck({ tinker: 2, wreck: 2, study: 2, prowl: 2 }, 'creation').ok).toBe(false);
    expect(stageCheck({ tinker: 3 }, 'creation')).toMatchObject({ over: ['tinker'], ok: false });
  });
  it('play 3, mastery 4, free unlimited', () => {
    expect(stageCheck({ tinker: 4 }, 'play')).toMatchObject({ cap: 3, over: ['tinker'], ok: false });
    expect(stageCheck({ tinker: 4, study: 4, wreck: 4 }, 'mastery')).toMatchObject({ cap: 4, over: [], ok: true, maxPoints: null });
    expect(stageCheck({ tinker: 4, study: 4 }, 'free')).toMatchObject({ cap: null, ok: true });
  });
});

describe('load', () => {
  const items = Character.shape.items.parse([
    { id: id(), name: 'Ружьё', load: 1 },
    { id: id(), name: 'Шприц', load: 1, qty: 5, carried: 2 },
    { id: id(), name: 'Метла', load: 1, carried: 0 },
    { id: id(), name: 'Верстак', load: 3, place: 'workshop', carried: 1 },
  ]);
  it('counts carried pieces of gear only', () => expect(loadUsed(items)).toBe(3));
  it('book limits 3/5/6', () => {
    expect(loadLimit('light', BOOK_RULES, [])).toBe(3);
    expect(loadLimit('normal', BOOK_RULES, [])).toBe(5);
    expect(loadLimit('heavy', BOOK_RULES, [])).toBe(6);
  });
  it('Mule raises them to 5/7/8', () => {
    const mods = talentMods(doc({ talents: ['mule'] }), DEFS);
    expect(['light', 'normal', 'heavy'].map(l => loadLimit(l as 'light', BOOK_RULES, mods))).toEqual([5, 7, 8]);
  });
  it('load:false means no limit', () => expect(loadLimit('heavy', { ...BOOK_RULES, load: false }, [])).toBeNull());
});

describe('armor', () => {
  it('any carried gear item with armor boxes; book default from content; workshop and stored items excluded', () => {
    const armor = id(), vest = id(), stored = id(), ws = id(), plain = id();
    const d = doc({
      items: [
        { id: armor, bookId: 'armor', load: 2 },
        { id: vest, name: 'Железный жилет', load: 2, props: { armor: 2 } },
        { id: stored, name: 'Кольчуга', load: 2, carried: 0, props: { armor: 1 } },
        { id: ws, name: 'Щит', load: 2, place: 'workshop', props: { armor: 1 } },
        { id: plain, bookId: 'lantern', load: 1 },
      ],
      armorUsed: { [vest]: 5 },
    });
    expect(armorAvailable(d, { armor: 1, 'heavy-armor': 1 })).toEqual([
      { itemId: armor, boxes: 1, used: 0 },
      { itemId: vest, boxes: 2, used: 2 },
    ]);
  });
  it('heavy armor gives a box only together with carried Armor (p. 104)', () => {
    const a = id(), h = id();
    const heavy = { id: h, bookId: 'heavy-armor', load: 3 };
    const book = { armor: 1, 'heavy-armor': 1 };
    expect(armorAvailable(doc({ items: [heavy] }), book)).toEqual([]);
    expect(armorAvailable(doc({ items: [heavy, { id: a, bookId: 'armor', load: 2, carried: 0 }] }), book)).toEqual([]);
    expect(armorAvailable(doc({ items: [heavy, { id: a, bookId: 'armor', load: 2 }] }), book).map(r => r.boxes)).toEqual([1, 1]);
  });
  it('book armor overridden to 0 gives none', () => {
    const d = doc({ items: [{ id: id(), bookId: 'armor', load: 2, props: { armor: 0 } }] });
    expect(armorAvailable(d, { armor: 1 })).toEqual([]);
  });
  it('special armor per talent, book and custom', () => {
    const ct = id();
    const d = doc({
      talents: ['fortitude', 'physicker'],
      customTalents: [{ id: ct, name: 'Своя защита', specialArmor: true }, { id: id(), name: 'Без защиты' }],
      specialArmorUsed: { fortitude: true },
    });
    expect(specialArmor(d, DEFS, { specialArmor: 'per-talent' })).toEqual([
      { talents: ['fortitude'], used: true, shared: false }, { talents: [ct], used: false, shared: false }]);
  });
  it('book: one shared special-armor box for all talents (p. 68)', () => {
    const ct = id();
    const d = doc({ talents: ['fortitude'], customTalents: [{ id: ct, name: 'Своя защита', specialArmor: true }], specialArmorShared: true });
    expect(specialArmor(d, DEFS, BOOK_RULES)).toEqual([{ talents: ['fortitude', ct], used: true, shared: true }]);
    expect(specialArmor(doc({ talents: ['physicker'] }), DEFS, BOOK_RULES)).toEqual([]);
    const r = rest(d, 'downtime');
    expect(r.doc.specialArmorShared).toBe(false);
    expect(r.specialArmor).toEqual(['*']);
  });
});

describe('stress', () => {
  it('book 9, +1 Survivor, custom count, playbook base', () => {
    expect(stressMax(BOOK_RULES, [])).toBe(9);
    expect(stressMax(BOOK_RULES, talentMods(doc({ talents: ['survivor'] }), DEFS))).toBe(10);
    expect(stressMax(custom, talentMods(doc({ talents: ['survivor'] }), DEFS))).toBe(12);
    expect(stressMax(BOOK_RULES, [], 12)).toBe(12);
  });
  it('custom talent mods count too', () => {
    expect(stressMax(BOOK_RULES, talentMods(doc({ customTalents: [{ id: id(), name: 'x', mods: { stressBoxes: 2 } }] }), DEFS))).toBe(11);
  });
});

describe('rest', () => {
  const armorId = id();
  const base = doc({
    day: 3, stress: 5, healing: 3,
    counters: [
      { id: id(), name: 'day', value: 2, reset: 'day' },
      { id: id(), name: 'downtime', value: 1, max: 2, reset: 'downtime' },
      { id: id(), name: 'score', value: 3, reset: 'score' },
      { id: id(), name: 'manual', value: 4, reset: 'manual' },
    ],
    specialArmorUsed: { fortitude: true, warded: false },
    armorUsed: { [armorId]: 1 },
  });
  const vals = (d: Character) => d.counters.map(c => c.value);

  it('day: +1 day, day counters only', () => {
    const r = rest(base, 'day');
    expect(r.doc.day).toBe(4);
    expect(vals(r.doc)).toEqual([0, 1, 3, 4]);
    expect(r.doc.specialArmorUsed).toEqual(base.specialArmorUsed);
    expect(r.doc.armorUsed).toEqual(base.armorUsed);
    expect(r.counters).toEqual([base.counters[0].id]);
  });
  it('downtime: day + downtime counters, clears special armor, day unchanged', () => {
    const r = rest(base, 'downtime');
    expect(r.doc.day).toBe(3);
    expect(vals(r.doc)).toEqual([0, 0, 3, 4]);
    expect(r.doc.specialArmorUsed).toEqual({});
    expect(r.specialArmor).toEqual(['fortitude']);
    expect(r.doc.armorUsed).toEqual(base.armorUsed);
  });
  it('score: score counters and armor boxes', () => {
    const r = rest(base, 'score');
    expect(vals(r.doc)).toEqual([2, 1, 0, 4]);
    expect(r.doc.armorUsed).toEqual({});
    expect(r.armor).toBe(true);
    expect(r.doc.specialArmorUsed).toEqual(base.specialArmorUsed);
  });
  it('never mutates the input and stays schema-valid', () => {
    const before = structuredClone(base);
    for (const k of ['day', 'downtime', 'score'] as const) Character.parse(rest(base, k).doc);
    expect(base).toEqual(before);
  });
  it('nothing to reset', () => expect(rest(doc(), 'score')).toMatchObject({ counters: [], armor: false, specialArmor: [] }));
  it('table downtime option: healing capped at 4, stress floored at 0', () => {
    const d = applyDowntimeOption(base, { id: id(), name: '+1/−1', healing: 1, stressRelief: 1 });
    expect([d.healing, d.stress]).toEqual([4, 4]);
    const e = applyDowntimeOption(applyDowntimeOption(d, { id: id(), name: '', healing: 1, stressRelief: 2 }), { id: id(), name: '', healing: 0, stressRelief: 9 });
    expect([e.healing, e.stress]).toEqual([4, 0]);
  });
});

describe('money', () => {
  const m = { coins: 0, stash: 0, major: 30, minor: 5 };
  it('break and join with a custom rate', () => {
    expect(breakMajor(m, 20)).toEqual({ ...m, major: 29, minor: 25 });
    expect(joinMinor({ ...m, minor: 45 }, 20)).toEqual({ ...m, major: 31, minor: 25 });
  });
  it('no-ops when impossible', () => {
    expect(breakMajor({ ...m, major: 0 }, 20)).toEqual({ ...m, major: 0 });
    expect(joinMinor(m, 20)).toBe(m);
  });
  it('totals and calculator; bad rate falls back to 1', () => {
    expect(totalMinor(m, 20)).toBe(605);
    expect(toMinor(1.5, 20)).toBe(30);
    expect(toMajor(110, 20)).toBe(5.5);
    expect(totalMinor(m, 0)).toBe(35);
  });
});

describe('xp', () => {
  it('track sizes', () => {
    expect(xpMax('insight', BOOK_RULES)).toBe(6);
    expect(xpMax('playbook', BOOK_RULES)).toBe(8);
    expect(xpMax('playbook', custom)).toBe(16);
  });
  it('foreign talent costs foreignTalentCost; own and custom cost 1', () => {
    expect(talentCost('mule', 'leech', DEFS, custom)).toBe(2);
    expect(talentCost('mule', 'leech', DEFS, BOOK_RULES)).toBe(1);
    expect(talentCost('physicker', 'leech', DEFS, custom)).toBe(1);
    expect(talentCost(id(), 'leech', DEFS, custom)).toBe(1);
  });
});

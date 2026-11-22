import { describe, expect, it } from 'vitest';
import {
  BOOK_RULES, Campaign, Character, CommonContent, CrewType, LocaleTexts, Playbook, Ruling, TableRules,
  type CharacterInput, type TableRules as Rules,
} from '../index';

const id = () => crypto.randomUUID();
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

// Table rules of the reference campaign (house rules, CLAUDE.md "Кампания").
const venomousPreset = { name: 'Производство анестезии за день', reset: 'day' as const, hint: '1-е за день — 1 стресс, дальше по 2 (особое усилие)' };
const iruviaRules: Rules = {
  mode: 'custom',
  money: { book: false, major: 'Драхмы', minor: 'Драхмёныши', rate: 20 },
  stress: { book: true, boxes: 9 },
  playbookXpBoxes: 8,
  load: true,
  bandolier: 'own-items',
  presets: 'book+own',
  talentPresets: { venomous: venomousPreset },
  dayCounter: true,
  downtime: {
    book: false,
    options: [
      { id: id(), name: '+1 лечение, −1 стресс', healing: 1, stressRelief: 1 },
      { id: id(), name: '−2 стресса', healing: 0, stressRelief: 2 },
    ],
  },
  skillStage: 'free',
  crewTier: 0,
  foreignTalentCost: 2,
};

// Искандер ибн Рашид (Сандр), Leech, as of 2026-11-15.
function sandr(): CharacterInput {
  const tinkerTools = id(), rifle = id(), bandolier = id();
  return {
    id: id(), schemaVersion: 1, playbookId: 'leech',
    name: 'Искандер ибн Рашид', alias: 'Сандр', day: 3,
    heritage: { bookId: 'iruvia', note: 'район Всезнающего и гильдии магов' },
    background: { bookId: 'trade', note: '' },
    vice: { bookId: 'obligation', note: 'клятва врача («обет хакима»)' },
    contacts: [{ id: id(), name: 'Резо, колдун с севера', rel: 'up', note: 'комната Хранителей, 1 этаж' }],
    actions: { tinker: 4, study: 2, survey: 1, hunt: 1, wreck: 2, prowl: 1, finesse: 1, skirmish: 0, consort: 1, attune: 1, command: 0, sway: 0 },
    xp: { insight: 1, prowess: 0, resolve: 0, playbook: 1 },
    talents: ['physicker', 'venomous', 'fortitude'],
    specialArmorUsed: { fortitude: false },
    money: { coins: 0, stash: 0, major: 30, minor: 0 },
    load: 'normal',
    items: [
      { id: tinkerTools, source: 'book', bookId: 'fine-tinkering-tools', load: 1 },
      {
        id: id(), source: 'book', bookId: 'fine-demolition-tools', load: 2, open: true,
        sub: ['сверло', 'молоток и клинья', 'фомка', 'зажимы', 'проволока'].map(name => ({ id: id(), name })),
      },
      { id: id(), source: 'book', bookId: 'blowgun', load: 0 },
      { id: bandolier, source: 'book', bookId: 'alchemists-bandolier', load: 1, slots: [{ name: '' }, { name: '' }, { name: '' }] },
      { id: id(), source: 'book', bookId: 'darts', load: 0 },
      { id: id(), source: 'book', bookId: 'syringes', load: 0 },
      { id: rifle, source: 'custom', name: 'Ружьё', load: 1, sub: [{ id: id(), name: 'Заряды', qty: 10 }] },
      { id: id(), source: 'custom', name: 'Памятка хранителя севера', load: 0 },
      { id: id(), source: 'custom', name: 'Штырь для гончарного круга', load: 0, qty: 5, carried: 5 },
    ],
    counters: [{ id: id(), name: venomousPreset.name, value: 0, reset: 'day', fromTalent: 'venomous', hint: venomousPreset.hint }],
    presetsApplied: ['venomous'],
    rulesOverride: iruviaRules,
  };
}

// Every optional field set at least once.
function full(): CharacterInput {
  const base = sandr();
  const armor = id(), ctId = id(), trId = id();
  return {
    ...base,
    campaignId: id(),
    look: 'худой, в кожаном фартуке', notes: 'история',
    friends: { stazia: 'up', eckerd: 'down' },
    customTalents: [{ id: ctId, name: 'Свой талант', text: 'как договорились', specialArmor: true, counter: { name: 'Заряды', max: 3, reset: 'score' }, mods: { stressBoxes: 1, load: { light: 4, normal: 6, heavy: 7 } } }],
    stress: 4,
    trauma: ['paranoid', trId],
    customTraumas: [{ id: trId, name: 'Боится воды' }],
    harm: { l3: 'сломана нога', l2: ['порез', ''], l1: ['ушиб', 'синяк'] },
    healing: 2,
    armorUsed: { [armor]: 1 },
    specialArmorUsed: { fortitude: true, [ctId]: false },
    items: [
      ...base.items!,
      {
        id: armor, source: 'book', bookId: 'armor', name: 'Кожаная куртка', load: 2, qty: 2, carried: 1, place: 'gear',
        note: 'с рынка', props: { type: 'standard', quality: 2, fine: true, uses: 3, usesLeft: 1, armor: 1, gives: '+d6', flaws: ['rare', 'скрипит'] },
      },
      { id: id(), source: 'custom', name: 'Верстак', load: 0, place: 'workshop', carried: 0 },
    ],
    workshop: [{ id: id(), name: 'Фонарь духов', done: 3, total: 8, qty: 1, load: 1, open: true, note: 'схема', props: { type: 'arcane', flaws: [] }, sub: [{ id: id(), name: 'линза' }] }],
    counters: [...base.counters!, { id: id(), name: 'Барьер, дней', value: 2, max: 5, reset: 'manual', fromTalent: ctId }],
    cards: [
      { id: id(), kind: 'rule', title: 'Лечение', text: 'дословно', pinned: true },
      {
        id: id(), title: 'Склад', text: '[ Первый этаж ]\n[[ Кабинет ]]', images: [{ id: id(), src: PNG, name: 'схема.png' }],
        plan: {
          current: 0, view: { x: 10, y: 20, zoom: 1.5 },
          floors: [{
            id: id(), name: 'Первый этаж', shapes: [
              { id: id(), kind: 'room', x: 0, y: 0, w: 180, h: 120, label: 'Кабинет' },
              { id: id(), kind: 'image', x: 0, y: 0, w: 50, h: 50, src: PNG },
              { id: id(), kind: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 },
              { id: id(), kind: 'door', x1: 0, y1: 0, x2: 20, y2: 0 },
              { id: id(), kind: 'window', x1: 40, y1: 0, x2: 60, y2: 0 },
              { id: id(), kind: 'pen', points: [[0, 0], [5, 5]] },
              { id: id(), kind: 'text', x: 5, y: 5, text: 'охрана' },
              { id: id(), kind: 'mark', x: 9, y: 9, glyph: '🔒', label: 'сейф' },
            ],
          }],
        },
      },
    ],
    rulesOverride: { crewTier: 1 },
  };
}

describe('Character', () => {
  it('parses the Leech reference character', () => {
    const c = Character.parse(sandr());
    expect(c.actions.tinker).toBe(4);
    expect(c.talents).toEqual(['physicker', 'venomous', 'fortitude']);
    expect(c.rulesOverride?.money).toEqual({ book: false, major: 'Драхмы', minor: 'Драхмёныши', rate: 20 });
    expect(c.items.find(i => i.name === 'Ружьё')?.sub[0]).toMatchObject({ name: 'Заряды', qty: 10 });
    expect(c.harm).toEqual({ l3: '', l2: ['', ''], l1: ['', ''] }); // defaults filled
  });

  it('parses a fully populated character, and parsing is idempotent through JSON', () => {
    const c = Character.parse(full());
    expect(Character.parse(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(c.cards[1].plan?.floors[0].shapes).toHaveLength(8);
  });

  it('keeps a partial rules override partial (no defaults leak in)', () => {
    expect(Character.parse(full()).rulesOverride).toEqual({ crewTier: 1 });
  });

  const bad: [string, (c: any) => void][] = [
    ['wrong schemaVersion', c => { c.schemaVersion = 2; }],
    ['missing playbookId', c => { delete c.playbookId; }],
    ['non-slug playbookId', c => { c.playbookId = 'Умелец'; }],
    ['non-uuid id', c => { c.id = 'u0'; }],
    ['action rating 5', c => { c.actions.tinker = 5; }],
    ['fractional stress', c => { c.stress = 1.5; }],
    ['attribute xp over 6', c => { c.xp.insight = 7; }],
    ['carried more than owned', c => { c.items[0].carried = 2; }],
    ['custom item with bookId', c => { c.items[6].bookId = 'pistol'; }],
    ['book item without bookId', c => { delete c.items[0].bookId; }],
    ['counter over max', c => { c.counters[0].max = 2; c.counters[0].value = 3; }],
    ['unknown counter reset', c => { c.counters[0].reset = 'none'; }],
    ['remote image', c => { c.cards[1].images[0].src = 'https://example.com/x.png'; }],
    ['unknown shape kind', c => { c.cards[1].plan.floors[0].shapes.push({ id: id(), kind: 'circle', x: 0, y: 0 }); }],
    ['plan without floors', c => { c.cards[1].plan.floors = []; }],
    ['bad rules override value', c => { c.rulesOverride = { foreignTalentCost: 3 }; }],
  ];
  it.each(bad)('rejects %s', (_, mutate) => {
    const c = structuredClone(full());
    mutate(c);
    expect(Character.safeParse(c).success).toBe(false);
  });
});

describe('Rules and campaign', () => {
  it('book defaults and the reference table parse', () => {
    expect(TableRules.parse(BOOK_RULES)).toEqual(BOOK_RULES);
    expect(Campaign.parse({ id: id(), name: 'Ирувия', rules: iruviaRules }).rules.foreignTalentCost).toBe(2);
  });

  it('rejects incomplete campaign rules', () => {
    const { downtime, ...rest } = iruviaRules;
    expect(Campaign.safeParse({ id: id(), name: 'Ирувия', rules: rest }).success).toBe(false);
  });

  it('ruling keeps a verbatim quote and needs a date and text', () => {
    const r = { id: id(), campaignId: id(), date: '2026-11-15', author: 'Хитрый_Лосось', quote: 'доза = 1 применение', topic: 'Ядовитость' };
    expect(Ruling.parse(r).quote).toBe(r.quote);
    expect(Ruling.safeParse({ ...r, quote: '' }).success).toBe(false);
    expect(Ruling.safeParse({ ...r, date: '15.11.2026' }).success).toBe(false);
  });
});

describe('Content', () => {
  const leech = {
    id: 'leech',
    startingActions: { tinker: 2, wreck: 1 },
    talents: [
      { id: 'alchemist', owner: 'leech' },
      { id: 'analyst', owner: 'leech', counter: { max: 2, reset: 'downtime' } },
      { id: 'fortitude', owner: 'leech', specialArmor: true },
      { id: 'ghost-ward', owner: 'leech', counter: { reset: 'manual' } },
    ],
    items: [{ id: 'fine-tinkering-tools', load: 1 }, { id: 'alchemists-bandolier', load: 1, bandolierSlots: 3 }],
    friends: ['stazia', 'veldren', 'eckerd', 'jul', 'malista'],
    builds: [{ id: 'physician', actions: { study: 2, consort: 1, finesse: 1 }, talent: 'physicker' }],
  };

  it('parses a playbook, special playbook and crew', () => {
    const p = Playbook.parse(leech);
    expect(p.talents.find(t => t.id === 'fortitude')?.specialArmor).toBe(true);
    expect(p.talents[0]).toMatchObject({ group: 'ability', specialArmor: false });
    expect(Playbook.parse({ ...leech, id: 'vampire', kind: 'special', stressBoxes: 12, talents: [{ id: 'terrible-power', group: 'stricture' }] }).stressBoxes).toBe(12);
    expect(CrewType.parse({
      id: 'shadows', talents: [{ id: 'everyone-steals', owner: 'shadows' }],
      upgrades: [{ id: 'thieves-rigging', group: 'crew' }, { id: 'steady', group: 'training', boxes: 1 }],
      contacts: ['dowler'], huntingGrounds: ['burglary'],
      claims: [{ id: 'lair', row: 1, col: 2, lair: true, links: ['interrogation-chamber'] }],
    }).claims[0].lair).toBe(true);
  });

  it('rejects a playbook with a non-slug talent id', () => {
    expect(Playbook.safeParse({ ...leech, talents: [{ id: 'Алхимик' }] }).success).toBe(false);
  });

  it('common content needs exactly 12 actions; locale texts are keyed by content id', () => {
    const actions = ['hunt', 'study', 'survey', 'tinker'].map(id => ({ id, attribute: 'insight' }));
    const common = { actions, items: [], traumas: [], heritages: [], backgrounds: [], vices: [], flaws: [], creations: [], creation: { freeActionDots: 4, maxRatingAtCreation: 2, talents: 1 } };
    expect(CommonContent.safeParse(common).success).toBe(false);
    expect(LocaleTexts.parse({ fortitude: { name: 'Стойкость', page: 102 }, venomous: { name: 'Ядовитость', counter: { name: 'Дозы' } } }).fortitude.name).toBe('Стойкость');
    expect(LocaleTexts.safeParse({ 'Стойкость': { name: 'Стойкость' } }).success).toBe(false);
  });
});

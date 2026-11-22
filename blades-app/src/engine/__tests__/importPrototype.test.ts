import { describe, expect, it } from 'vitest';
import { Character, TableRules } from '../../model';
import { importPrototype, LEFTOVERS_TITLE } from '../importPrototype';
import { loadCharacter } from '../migrate';
import * as P from '../prototypeIds';
import { armorAvailable } from '../armor';
import { loadUsed } from '../load';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

// Prototype export of Искандер ибн Рашид (Сандр), Leech, shaped like a real charsheet.html save after a few sessions.
const sandrSave = () => ({
  name: 'Искандер ибн Рашид', alias: 'Сандр',
  look: 'Мужчина около тридцати, худой и жилистый, шрам над левой бровью',
  bioNote: 'Работает на Резо, колдуна с Севера. Живёт в мастерской на 3-м этаже.',
  heritage: 'Ирувия', heritageNote: 'родился в районе Всезнающего, у гильдии магов',
  background: 'Торговец', backgroundNote: 'торговал механизмами и искровыми деталями',
  vice: 'Долг: клятва врача', viceNote: 'Обет хакима: лечу бесплатно, когда могу помочь',
  actions: { 'Изучение': 2, 'Охота': 1, 'Разведка': 1, 'Ремесло': 4, 'Драка': 0, 'Проникновение': 1, 'Разрушение': 2, 'Сноровка': 1, 'Манипулирование': 0, 'Общение': 1, 'Приказ': 0, 'Резонанс': 1 },
  xp: { 'Чутьё': 1, 'Удаль': 0, 'Воля': 0, 'Талант': 1 },
  stress: 3, trauma: ['Параноик', 'Бессонница'], traumaExtra: ['Бессонница'],
  h3: '', h2a: 'Порез плеча', h2b: '', h1a: 'Ушиб', h1b: '', heal: 2,
  armor: { a: 0, h: 0, s: 1 }, // legacy "special armor used" flag
  coin: 0, stash: 0,
  talents: ['Врач', 'Ядовитость', 'Стойкость'],
  customTalents: [{ id: 'k3j9x1a', n: 'Глаз хакима', x: 'видит болезнь по лицу (договорились с мастером)' }],
  items: ['s0', 's1', 's2', 's3', 's9', 'c6'],
  base: ['s9'], bqty: { s9: 3 }, btake: { s9: 2 },
  loadOv: { s2: 0 }, nameOv: { s0: 'Инструменты механика (отцовские)' },
  subOv: { s1: ['Маленькое, но мощное сверло', 'Молоток и стальные клинья', 'Фомка', 'зажимы', 'проволока'], s8: ['старые дротики'] },
  itemNotes: { s0: 'достались от отца', c6: 'кожанка с нашитыми пластинами' },
  itemProps: { s0: { q: 2, good: true }, s8: {} },
  armorOv: { c6: 2 }, armorUsed: { c6: 1, u0: 0 },
  open: ['s0', 's1', 's3'], load: '5',
  bandolier: ['Шприц с анестезией', 'Шприц с анестезией', 'Спирт', '', '', ''], bandQ: { 0: 1, 1: 1, 2: '' },
  custom: [
    { n: 'Ружьё', l: 1, sub: [{ n: 'Заряд к ружью', q: 10 }], open: true },
    { n: 'Шприц с анестезией', l: 0, qty: 3, take: 2, note: 'хранится ~сутки', type: 'алхимия', q: '', uses: 1, left: 1, flaws: ['ненадёжное', 'опасное'], gives: 'беспамятство' },
    { n: 'Спирт', l: '0' },
    { n: 'памятка хранителя севера', l: 0, note: '1 - Сначала думай, потом делай!' },
    { n: 'Штырь для гончарного круга', l: 0, qty: 5, take: 0 },
  ],
  ws: [{ n: 'отличный ручной гончарный круг', l: 0, qty: 1, q: 3, good: true, note: 'выкинул две 6' }, { book: 'c10' }],
  prod: [
    { n: 'Кираса для Ру (лист железа 7мм)', v: 6, m: 25, q: 1, note: '' },
    { n: 'Фильтр для воды', v: '', m: '', q: 1, note: 'НУЖНО СЕРЕБРО', sub: ['уголь', { n: 'песок', q: 2 }] },
  ],
  rules: { mode: 'custom', money: false, stress: true, carry: true, band: false, presets: false, day: true, rest2: true, major: 'Драхмы', minor: 'Драхмёныши', rate: 20, stressN: 9, talentXP: 16, stage: 'free', tier: 0 },
  tips: false, day: '5', rbPage: 183,
  contacts: [{ id: 'a1b2c3d', n: 'Резо, колдун с севера', rel: 'up' }, { id: 'z9y8x7w', n: 'Ру, старший сотрудник', rel: 'down' }],
  friends: { 'Стация, аптекарь': 'up', 'Джул, торговец кровью': 'down', 'Экерд, похититель трупов': '' },
  counters: [
    { id: 'rl5tgr9', n: 'Стойкость (особая защита)', v: 1, max: 1, r: 'downtime', h: '1 раз до передышки', from: 'Стойкость' }, // legacy
    { id: 'q1w2e3r', n: 'Дни до зарплаты', v: 2, max: 7, r: 'none', h: '' },
  ],
  tc: { 'Ядовитость': 1 }, // Ядовитость counter value from before presets existed
  ctrOrder: ['c:q1w2e3r', 'c:rl5tgr9', 'c:gone000'],
  presetDone: ['Ядовитость', 'Стойкость'],
  spec: {},
  dr: 30, drm: '110',
  cards: [
    { t: 'Ядовитость Сандра', x: 'Доза = 1 применение. 1-3 → 0 доз, 4-5 → 1, 6 → 2, 6&6 → 3.', rule: true },
    { t: 'Поговорить с Резо', x: 'разрешение бесплатно лечить жителей', pin: true },
    {
      t: 'Дом Резо', x: 'Стекло не трогать — безопасность превыше всего', imgs: [PNG],
      plan: {
        f: 1, v: { x: 10, y: 20, z: 0.5 },
        floors: [
          { n: 'Первый этаж', s: [
            { k: 'r', x: 0, y: 0, w: 480, h: 440, t: 'Хранители Севера' },
            { k: 'l', x1: 480, y1: 280, x2: 480, y2: 360, d: 1 },
            { k: 'l', d: 2, x1: 0, y1: 240, x2: 0, y2: 320 },
            { k: 'l', x1: 0, y1: 0, x2: 100, y2: 0 },
            { k: 'm', x: 600, y: 140, g: '✕', t: 'ловушка на лестнице 1→2' },
            { k: 't', x: 0, y: -20, t: 'Все окна заколочены намертво' },
            { k: 'p', pts: [[1, 2], [3, 4], [5, 6]] },
          ] },
          { n: 'Третий этаж', s: [{ k: 'r', x: 0, y: 0, w: 200, h: 200, t: 'Мастерская Сандра' }, { k: 'i', x: 5, y: 5, w: 50, h: 40, src: PNG }] },
        ],
      },
    },
  ],
  notes: '', mig1: 1, cardSel: 2, cardMode: 'plan', cardKind: '', noteView: false,
  ai: true, aiPort: 8765, aiToken: 'SECRET-TOKEN',
  futureField: { x: 'поле из будущей версии бланка' },
});

const ids = (c: Character): Record<string, Character['items'][number]> => Object.fromEntries(c.items.map(i => [i.name ?? i.bookId, i]));

describe('importPrototype: reference character', () => {
  const save = sandrSave();
  const { character: c, rules, warnings, ui } = importPrototype(JSON.stringify(save));
  const item = ids(c);

  it('passes the schemas', () => {
    expect(Character.safeParse(c).success).toBe(true);
    expect(TableRules.safeParse(rules).success).toBe(true);
  });

  it('round-trips through JSON and the document migration path unchanged', async () => {
    const json = JSON.parse(JSON.stringify(c));
    expect(Character.parse(json)).toEqual(c);
    expect(await loadCharacter(json)).toEqual(c);
    expect(TableRules.parse(JSON.parse(JSON.stringify(rules)))).toEqual(rules);
  });

  it('nothing lost: every text of the save is in the document, the rules or as a content id', () => {
    const collect = (v: unknown, out: Set<string>): Set<string> => {
      if (typeof v === 'string') out.add(v);
      else if (Array.isArray(v)) v.forEach(x => collect(x, out));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); collect(x, out); }
      return out;
    };
    const { aiToken: _t, ...data } = save;
    const have = collect([c, rules], new Set());
    const names: Record<string, string> = { ...P.ACTIONS, ...P.XP, ...P.TALENTS, ...P.HERITAGES, ...P.BACKGROUNDS, ...P.VICES, ...P.TRAUMAS, ...P.FRIENDS, ...P.FLAWS, ...P.ITEM_TYPES };
    // the prototype itself turns legacy special-armor counters into checkboxes on load;
    // a friend set to '' is hidden, i.e. the same as absent
    const consumed = new Set(['Стойкость (особая защита)', '1 раз до передышки', 'Экерд, похититель трупов']);
    const leftoversText = c.cards.find(k => k.title === LEFTOVERS_TITLE)?.text ?? '';
    const missing = [...collect(data, new Set())]
      .filter(s => /[А-Яа-яЁё]/.test(s) || s.startsWith('data:'))
      .filter(s => !have.has(s) && !(names[s] && have.has(names[s])) && !consumed.has(s) && !leftoversText.includes(JSON.stringify(s)));
    expect(missing).toEqual([]);
    expect(JSON.stringify([c, rules, ui])).not.toContain('SECRET-TOKEN');
  });

  it('identity, origins, actions, xp', () => {
    expect([c.name, c.alias, c.playbookId, c.day, c.notes]).toEqual(['Искандер ибн Рашид', 'Сандр', 'leech', 5, save.bioNote]);
    expect(c.heritage).toEqual({ bookId: 'iruvia', note: save.heritageNote });
    expect(c.background).toEqual({ bookId: 'trade', note: save.backgroundNote });
    expect(c.vice).toEqual({ bookId: 'obligation', name: 'Долг: клятва врача', note: save.viceNote });
    expect(c.actions).toEqual({ study: 2, hunt: 1, survey: 1, tinker: 4, skirmish: 0, prowl: 1, wreck: 2, finesse: 1, sway: 0, consort: 1, command: 0, attune: 1 });
    expect(c.xp).toEqual({ insight: 1, prowess: 0, resolve: 0, playbook: 1 });
  });

  it('talents, special armor from the legacy counter, presets', () => {
    expect(c.talents).toEqual(['physicker', 'venomous', 'fortitude']);
    expect(c.customTalents).toEqual([{ id: expect.any(String), name: 'Глаз хакима', text: save.customTalents[0].x, specialArmor: false }]);
    expect(c.specialArmorUsed).toEqual({ fortitude: true });
    expect(c.presetsApplied.sort()).toEqual(['fortitude', 'venomous']);
  });

  it('counters: ctrOrder respected, Ядовитость preset carries its old value, none → manual', () => {
    expect(c.counters.map(x => [x.name, x.value, x.max, x.reset, x.fromTalent])).toEqual([
      ['Дни до зарплаты', 2, 7, 'manual', undefined],
      ['Производство анестезии за день', 1, undefined, 'day', 'venomous'],
    ]);
    expect(c.counters[1].hint).toBe(P.TALENT_PRESETS['Ядовитость'].h);
  });

  it('stress, trauma, harm', () => {
    expect([c.stress, c.healing]).toEqual([3, 2]);
    const own = c.customTraumas.find(t => t.name === 'Бессонница')!;
    expect(c.trauma).toEqual(['paranoid', own.id]);
    expect(c.harm).toEqual({ l3: '', l2: ['Порез плеча', ''], l1: ['Ушиб', ''] });
  });

  it('money: custom currency kept as numbers, book coins too', () => {
    expect(c.money).toEqual({ coins: 0, stash: 0, major: 30, minor: 110 });
    expect(rules.money).toEqual({ book: false, major: 'Драхмы', minor: 'Драхмёныши', rate: 20 });
  });

  it('book items: ids, renames, overrides, quantities', () => {
    const tools = item['Инструменты механика (отцовские)'];
    expect(tools).toMatchObject({ bookId: 'fine-tinkering-tools', load: 1, carried: 1, open: true, note: 'достались от отца' });
    expect(tools.props).toMatchObject({ quality: 2, fine: true });
    expect(item['fine-wrecking-tools'].sub!.map(s => s.name)).toEqual(save.subOv.s1);
    expect(item['Духовая трубка']).toMatchObject({ bookId: 'blowgun-and-darts', load: 0 });
    expect(item['Пустые шприцы']).toMatchObject({ bookId: 'blowgun-and-darts', qty: 3, carried: 2 });
    expect(item.armor).toMatchObject({ note: 'кожанка с нашитыми пластинами', props: expect.objectContaining({ armor: 2 }) });
    expect(c.load).toBe('normal');
  });

  it('bandolier slots hold own items and link to the stock item', () => {
    const band = item['alchemists-bandolier'];
    const syringe = item['Шприц с анестезией'], spirit = item['Спирт'];
    expect(band.slots).toEqual([
      { name: 'Шприц с анестезией', qty: 1, itemId: syringe.id },
      { name: 'Шприц с анестезией', qty: 1, itemId: syringe.id },
      { name: 'Спирт', itemId: spirit.id },
    ]);
    expect(rules.bandolier).toBe('own-items');
  });

  it('own items: rifle with 10 charges, props, quantities', () => {
    expect(item['Ружьё']).toMatchObject({ load: 1, qty: 1, carried: 1, open: true });
    expect(item['Ружьё'].bookId).toBeUndefined();
    expect(item['Ружьё'].sub).toEqual([{ id: expect.any(String), name: 'Заряд к ружью', qty: 10 }]);
    expect(item['Шприц с анестезией']).toMatchObject({ qty: 3, carried: 2, note: 'хранится ~сутки' });
    expect(item['Шприц с анестезией'].props).toEqual({ type: 'alchemical', quality: undefined, fine: false, uses: 1, usesLeft: 1, armor: undefined, gives: 'беспамятство', flaws: ['unreliable', 'dangerous'] });
    expect(item['Штырь для гончарного круга']).toMatchObject({ qty: 5, carried: 0 });
  });

  it('armor used is keyed by the new item id; engine sees the armor', () => {
    expect(c.armorUsed).toEqual({ [item.armor.id]: 1 });
    expect(armorAvailable(c, { armor: 1 })).toEqual([{ itemId: item.armor.id, boxes: 2, used: 1 }]);
    // 1+2+0+1+0×2(syringes)+2(armor)+1(rifle)+0… = 7
    expect(loadUsed(c.items)).toBe(7);
  });

  it('workshop: equipment as workshop items, projects with progress', () => {
    const ws = c.items.filter(i => i.place === 'workshop');
    expect(ws.map(i => [i.bookId, i.name, i.carried])).toEqual([[undefined, 'отличный ручной гончарный круг', 0], ['tinkering-tools', undefined, 0]]);
    expect(ws[0].props).toMatchObject({ quality: 3, fine: true });
    expect(c.workshop.map(w => [w.name, w.done, w.total, w.qty, w.load])).toEqual([
      ['Кираса для Ру (лист железа 7мм)', 6, 25, 1, 1],
      ['Фильтр для воды', undefined, undefined, 1, 1],
    ]);
    expect(c.workshop[1].sub.map(s => [s.name, s.qty])).toEqual([['уголь', undefined], ['песок', 2]]);
  });

  it('contacts and friends', () => {
    expect(c.contacts.map(x => [x.bookId, x.name, x.rel])).toEqual([
      ['stazia', undefined, 'up'], ['jul', undefined, 'down'], // hidden Экерд ('') is not a contact
      [undefined, 'Резо, колдун с севера', 'up'], [undefined, 'Ру, старший сотрудник', 'down'],
    ]);
  });

  it('cards: rule/pinned/images, plan with every shape kind', () => {
    const [rule, pinned, house] = c.cards;
    expect([rule.kind, rule.title, pinned.pinned, pinned.kind]).toEqual(['rule', 'Ядовитость Сандра', true, 'note']);
    expect(house.images).toEqual([{ id: expect.any(String), src: PNG }]);
    const plan = house.plan!;
    expect([plan.current, plan.view]).toEqual([1, { x: 10, y: 20, zoom: 0.5 }]);
    expect(plan.floors.map(f => f.name)).toEqual(['Первый этаж', 'Третий этаж']);
    expect(plan.floors[0].shapes.map(s => s.kind)).toEqual(['room', 'door', 'window', 'wall', 'mark', 'text', 'pen']);
    expect(plan.floors[0].shapes[0]).toMatchObject({ x: 0, y: 0, w: 480, h: 440, label: 'Хранители Севера' });
    expect(plan.floors[0].shapes[1]).toMatchObject({ x1: 480, y1: 280, x2: 480, y2: 360 });
    expect(plan.floors[0].shapes[4]).toMatchObject({ glyph: '✕', label: 'ловушка на лестнице 1→2' });
    expect(plan.floors[0].shapes[6]).toMatchObject({ points: [[1, 2], [3, 4], [5, 6]] });
    expect(plan.floors[1].shapes[1]).toMatchObject({ kind: 'image', src: PNG });
    expect(new Set(c.cards.flatMap(k => [k.id, ...(k.plan?.floors.flatMap(f => [f.id, ...f.shapes.map(s => s.id)]) ?? [])])).size)
      .toBe(c.cards.length + 2 + 9);
  });

  it('unmappable data goes to a pinned leftovers card, with warnings', () => {
    const card = c.cards.at(-1)!;
    expect(card).toMatchObject({ title: LEFTOVERS_TITLE, pinned: true, kind: 'note' });
    expect(JSON.parse(card.text)).toEqual({ futureField: save.futureField, 'subOv.s8': ['старые дротики'] });
    expect(warnings).toHaveLength(2);
  });

  it('rules: the table settings', () => {
    expect(rules).toMatchObject({
      mode: 'custom', stress: { book: true, boxes: 9 }, playbookXpBoxes: 16, specialArmor: 'shared', load: true, bandolier: 'own-items',
      presets: 'book+own', dayCounter: true, skillStage: 'free', crewTier: 0, foreignTalentCost: 1,
      talentPresets: { venomous: { name: 'Производство анестезии за день', reset: 'day', hint: P.TALENT_PRESETS['Ядовитость'].h } },
    });
    expect(rules.downtime.book).toBe(false);
    expect(rules.downtime.options.map(o => [o.healing, o.stressRelief])).toEqual([[1, 1], [0, 2]]);
    expect(ui).toEqual({ tips: false, rbPage: 183, noteView: false });
  });

  it('every id is a fresh UUID; index ids are gone', () => {
    const all = [c.id, ...c.items.map(i => i.id), ...c.counters.map(x => x.id), ...c.contacts.map(x => x.id), ...c.customTalents.map(x => x.id)];
    expect(new Set(all).size).toBe(all.length);
    expect(JSON.stringify(c)).not.toMatch(/"(k3j9x1a|a1b2c3d|q1w2e3r|u0|s0|c6)"/);
  });
});

describe('importPrototype: prototype load quirks', () => {
  it('empty save → fresh sheet with book rules', () => {
    const { character: c, rules } = importPrototype('');
    expect(c.actions).toMatchObject({ tinker: 2, wreck: 1, study: 0 });
    expect(rules.mode).toBe('book');
    expect(c.cards).toEqual([]);
  });

  it('save without rules → the home table rules (OUR_RULES)', () => {
    const { rules } = importPrototype({ name: 'x' });
    expect(rules).toMatchObject({ mode: 'custom', money: { book: false, rate: 20 }, dayCounter: true, downtime: { book: false }, skillStage: 'free', presets: 'book+own', bandolier: 'own-items' });
  });

  it('backup wrapper {at, data} is unwrapped', () => {
    expect(importPrototype({ at: '15.11.2026', data: { name: 'Сандр', rules: { mode: 'book' } } }).character.name).toBe('Сандр');
  });

  it('mig1: old blowgun gets darts and syringes; legacy anaesthesia counter becomes the preset', () => {
    const { character: c } = importPrototype({
      items: ['s2'], loadOv: { s2: 1 }, talents: ['Ядовитость'], rules: { mode: 'custom', presets: false },
      counters: [{ n: 'Производство анестезии за день', v: 2, max: '', r: 'day' }],
    });
    expect(c.items.map(i => [i.name, i.load])).toEqual([['Духовая трубка', 0], ['Дротики (под алхимию)', 0], ['Пустые шприцы', 0]]);
    expect(c.counters.map(x => [x.name, x.value, x.fromTalent])).toEqual([['Производство анестезии за день', 2, 'venomous']]);
  });

  it('book presets mode: no Ядовитость counter, book Аналитик counter added', () => {
    const { character: c } = importPrototype({ talents: ['Ядовитость', 'Аналитик'], rules: { mode: 'book' } });
    expect(c.counters.map(x => [x.fromTalent, x.max, x.reset])).toEqual([['analyst', 2, 'downtime']]);
  });

  it('legacy armor.s marks special armor used; plans without shapes are dropped like the prototype does', () => {
    const { character: c } = importPrototype({
      talents: ['Тень', 'Врач'], armor: { a: 0, h: 0, s: 1 }, rules: {},
      cards: [{ t: 'пусто', x: '', plan: { f: 0, floors: [{ n: '1 этаж', s: [] }], v: { x: 0, y: 0, z: 1 } } }],
    });
    expect(c.specialArmorUsed).toEqual({ shadow: true });
    expect(c.cards[0].plan).toBeUndefined();
  });

  it('legacy armor.a goes to the Armor item', () => {
    const { character: c } = importPrototype({ items: ['c6'], armor: { a: 1, h: 0, s: 0 }, rules: {} });
    expect(Object.values(c.armorUsed)).toEqual([1]);
  });

  it('unknown names are kept as custom entities, never dropped', () => {
    const { character: c, warnings } = importPrototype({
      talents: ['Новый талант'], trauma: ['Странная травма'], friends: { 'Незнакомец': 'down' },
      counters: [{ id: 'x', n: 'По таланту', v: 1, max: '', r: 'score', from: 'Новый талант' }],
      items: ['s99'], spec: { 'Новый талант': true }, rules: {},
    });
    const ct = c.customTalents[0];
    expect(ct.name).toBe('Новый талант');
    expect(c.counters[0].fromTalent).toBe(ct.id);
    expect(c.specialArmorUsed).toEqual({ [ct.id]: true });
    expect(c.customTraumas.map(t => t.name)).toEqual(['Странная травма']);
    expect(c.trauma).toEqual([c.customTraumas[0].id]);
    expect(c.contacts).toMatchObject([{ name: 'Незнакомец', rel: 'down' }]);
    expect(c.items.map(i => [i.bookId, i.name])).toEqual([[undefined, 's99']]);
    expect(warnings.length).toBe(3); // talent, friend, item; an unknown trauma is just a custom trauma
  });

  it('second bandolier with content becomes a custom item at base', () => {
    const { character: c } = importPrototype({ items: ['s3', 's4'], bandolier: ['', '', '', 'Спирт', '', ''], bandQ: { 3: 2 }, rules: {} });
    expect(c.items.map(i => i.bookId ?? i.name)).toEqual(['alchemists-bandolier', 'Вторая перевязь алхимика']);
    expect(c.items[1]).toMatchObject({ carried: 0, slots: [{ name: 'Спирт', qty: 2 }, { name: '' }, { name: '' }] });
    expect(loadUsed(c.items)).toBe(1);
  });

  it('out-of-range and broken values are clamped, the original kept in leftovers', () => {
    const { character: c } = importPrototype({
      coin: 7, heal: '3', actions: { 'Ремесло': 5 }, rules: {},
      counters: [{ id: 'a', n: 'c', v: 9, max: 3, r: 'day' }, { id: 'b', n: 'z', v: 0, max: 0, r: 'weird' }],
      cards: [{ t: 'p', x: '', imgs: ['http://x/y.png'], plan: { f: 9, floors: [{ n: 'F', s: [{ k: 't', x: 1, y: 1, t: '' }, { k: 'r', x: 0, y: 0, w: 1, h: 1, t: '' }] }], v: { x: 0, y: 0, z: 0 } } }],
    });
    expect([c.money.coins, c.healing, c.actions.tinker]).toEqual([4, 3, 4]);
    expect(c.counters.map(x => [x.value, x.max, x.reset])).toEqual([[3, 3, 'day'], [0, 0, 'manual']]); // max 0 is kept: the prototype caps the counter at 0
    expect(c.cards[0].images).toEqual([]);
    expect(c.cards[0].plan).toMatchObject({ current: 0, view: { zoom: 1 } });
    expect(c.cards[0].plan!.floors[0].shapes.map(s => s.kind)).toEqual(['text', 'room']); // empty text label is valid
    const left = JSON.parse(c.cards.at(-1)!.text);
    expect(left).toMatchObject({ coin: 7, 'actions.Ремесло': 5, 'counters.0.v': 9, 'counters.1.r': 'weird', 'cards.0.imgs.0': 'http://x/y.png' });
    expect(left).not.toHaveProperty(['counters.1.max']);
  });
});

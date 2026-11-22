// Lossless import of a charsheet.html save (localStorage `bitd-leech`, its `-backup`, or an exported JSON)
// into a v1 character document + table rules. Anything the schema cannot hold goes into a note card.
import { CardImage, Character, Shape, TableRules, type CharacterInput, type Contact, type Counter } from '../model';
import * as P from './prototypeIds';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

export interface PrototypeImport {
  character: Character;
  /** Table rules of the save: put into a campaign, or into `character.rulesOverride`. */
  rules: TableRules;
  /** Prototype UI state, for the settings table. */
  ui: { tips: boolean; rbPage?: number; noteView?: boolean };
  /** Human-readable list of everything stored differently or moved to the leftovers card. */
  warnings: string[];
}

export const LEFTOVERS_TITLE = 'Импорт: не перенесено';

const uuid = () => crypto.randomUUID();
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string => (v == null ? '' : String(v));
const empty = (v: unknown) => v === '' || v == null;

// prototype fresh() and OUR_RULES, verbatim
const freshRules = () => ({ mode: 'book', money: true, stress: true, carry: true, band: true, presets: true, day: false, rest2: false, major: 'Драхмы', minor: 'Драхмёныши', rate: 20, stressN: 9, talentXP: 8, stage: 'creation', tier: 0 });
const OUR_RULES = { mode: 'custom', money: false, stress: true, band: false, presets: false, day: true, rest2: true, major: 'Драхмы', minor: 'Драхмёныши', rate: 20, stressN: 9, stage: 'free', tier: 0 };
const fresh = (): Raw => ({
  name: '', alias: '', look: '', bioNote: '', heritage: '', heritageNote: '', background: '', backgroundNote: '', vice: '', viceNote: '',
  actions: Object.fromEntries(Object.keys(P.ACTIONS).map(a => [a, a === 'Ремесло' ? 2 : a === 'Разрушение' ? 1 : 0])),
  xp: { 'Чутьё': 0, 'Удаль': 0, 'Воля': 0, 'Талант': 0 }, stress: 0, trauma: [], h3: '', h2a: '', h2b: '', h1a: '', h1b: '', heal: 0,
  armor: { a: 0, h: 0, s: 0 }, coin: 0, stash: 0, talents: [], items: [], base: [], ws: [], rbPage: 1, rules: freshRules(), tips: true, day: 1,
  itemProps: {}, customTalents: [], contacts: [], traumaExtra: [], armorOv: {}, armorUsed: {}, prod: [], cards: [], itemNotes: {}, bqty: {}, btake: {},
  loadOv: {}, nameOv: {}, subOv: {}, open: ['s3', 's4'], load: '3', bandolier: ['', '', '', '', '', ''], custom: [], bandQ: {}, counters: [], tc: {},
  ctrOrder: [], presetDone: [], spec: {}, dr: 0, drm: 0, friends: {}, notes: '',
});
// top-level keys that are UI state or one-off flags: consumed, not data
const UI_KEYS = ['mig1', 'mig2', 'cardSel', 'cardMode', 'cardKind', 'noteView', 'ai', 'aiPort', 'aiToken', 'tips', 'rbPage', 'open'];
const RULE_KEYS = Object.keys(freshRules()).concat('rest2');
const CUSTOM_ITEM_KEYS = ['n', 'l', 'qty', 'take', 'base', 'sub', 'note', 'open', 'armor', 'type', 'q', 'good', 'uses', 'left', 'gives', 'flaws'];
const PROP_KEYS = ['type', 'q', 'good', 'uses', 'left', 'gives', 'flaws'];

/** The prototype's own load path: loadRaw() + the one-time migrations at the top of its script. */
export function prototypeLoad(input: unknown): Raw {
  let r = obj(typeof input === 'string' ? JSON.parse(input || '{}') : structuredClone(input));
  if (r.data && r.at && Object.keys(r).length === 2) r = obj(r.data); // backup wrapper {at, data}
  if (Object.keys(r).length && !r.rules) r.rules = { ...OUR_RULES };
  const f = fresh();
  const S: Raw = Object.assign(f, r, { rules: { ...freshRules(), ...obj(r.rules) } });
  for (const k of Object.keys(f)) { // repair wrong container types instead of crashing
    if (Array.isArray(fresh()[k]) && !Array.isArray(S[k])) S[k] = fresh()[k];
    else if (fresh()[k] && typeof fresh()[k] === 'object' && !Array.isArray(fresh()[k]) && (typeof S[k] !== 'object' || !S[k] || Array.isArray(S[k]))) S[k] = fresh()[k];
  }
  const R = S.rules, bookPresets = R.mode === 'book' || !!R.presets;

  S.items = [...new Set(S.items.filter((x: string) => x !== 's4'))];
  if (!S.mig1) { S.mig1 = 1; delete S.loadOv.s2; delete S.subOv.s2; if (S.items.includes('s2')) S.items = [...new Set([...S.items, 's8', 's9'])]; }
  if (!S.cards.length && S.notes) { S.cards = [{ t: 'Заметки', x: S.notes }]; S.notes = ''; }
  for (const c of S.cards) if (c?.plan && !arr(c.plan.floors).some(f => arr(f?.s).length)) delete c.plan;
  { const k = S.counters.findIndex((c: Raw) => c?.n === 'Производство анестезии за день' && !c.from); if (k >= 0) { S.tc['Ядовитость'] = S.counters[k].v; S.counters.splice(k, 1); } }
  S.counters = S.counters.filter((c: unknown) => c && typeof c === 'object');
  S.counters.forEach((c: Raw) => { if (!c.id) c.id = uuid(); });
  if (!S.mig2) { S.mig2 = 1; S.presetDone = S.presetDone.filter((t: string) => S.counters.some((c: Raw) => c.from === t)); }
  S.counters = S.counters.filter((c: Raw) => { if (!P.SPECIAL_ARMOR.includes(c.from)) return true; S.spec[c.from] = !!c.v; return false; });
  if (S.armor?.s) { for (const t of S.talents) if (P.SPECIAL_ARMOR.includes(t) && !(t in S.spec)) S.spec[t] = true; S.armor.s = 0; }
  // presetSync
  const preset = (t: string) => { const p = P.TALENT_PRESETS[t]; return p && (p.book || !bookPresets) ? p : null; };
  for (const t of S.talents) if (preset(t) && !S.presetDone.includes(t)) {
    const p = preset(t)!;
    S.counters.push({ id: uuid(), n: p.n, v: S.tc[t] || 0, max: p.max, r: p.r, h: p.h || '', from: t });
    S.presetDone.push(t);
  }
  S.presetDone = S.presetDone.filter((t: string) => S.talents.includes(t));
  return S;
}

export function importPrototype(input: unknown, opts: { campaignId?: string; playbookId?: string } = {}): PrototypeImport {
  const S = prototypeLoad(input);
  const warnings: string[] = [];
  const leftovers: Raw = {};
  const left = (path: string, value: unknown, why: string) => { leftovers[path] = value; warnings.push(`${path}: ${why}`); };
  const extra = (o: Raw, known: string[], path: string) => { for (const k of Object.keys(o)) if (!known.includes(k)) left(`${path}.${k}`, o[k], 'unknown field'); };
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const int = (v: unknown, path: string, def: number, min = 0, max = Infinity): number => {
    if (empty(v)) return def;
    const n = num(v);
    if (!Number.isFinite(n)) { left(path, v, 'not a number'); return def; }
    const out = Math.min(max, Math.max(min, Math.round(n)));
    if (out !== n) left(path, v, `stored as ${out}`);
    return out;
  };
  const optInt = (v: unknown, path: string, min = 0, max = Infinity) => (empty(v) ? undefined : int(v, path, min, min, max));

  // talents first: counters, special armor and presets refer to them
  const talents: string[] = [];
  const customTalents: { id: string; name: string; text: string }[] = arr(S.customTalents).map((c: Raw, i) => {
    extra(obj(c), ['id', 'n', 'x'], `customTalents.${i}`);
    return { id: uuid(), name: str(c?.n), text: str(c?.x) };
  });
  const byName = new Map<string, string>();
  for (const t of S.talents) {
    const id = P.TALENTS[t];
    if (id) { if (!talents.includes(id)) talents.push(id); continue; }
    const ct = { id: uuid(), name: str(t), text: '' };
    customTalents.push(ct); byName.set(t, ct.id);
    warnings.push(`talents: "${t}" is not a known talent, imported as a custom one`);
  }
  const talentRef = (t: unknown) => P.TALENTS[str(t)] ?? byName.get(str(t));

  // items: own gear first (bandolier slots link to it), then book gear, workshop
  const gearKey = new Map<string, string>();
  const props = (p: Raw, armor: unknown, path: string) => {
    const type = p.type ? P.ITEM_TYPES[p.type] : undefined;
    if (p.type && !type) left(`${path}.type`, p.type, 'unknown item type');
    return {
      type, quality: optInt(p.q, `${path}.q`, 0, 6), fine: !!p.good,
      uses: optInt(p.uses, `${path}.uses`), usesLeft: optInt(p.left, `${path}.left`),
      armor: optInt(armor, `${path}.armor`, 0, 5), gives: str(p.gives),
      flaws: arr(p.flaws).map(f => P.FLAWS[f] ?? str(f)).filter(Boolean),
    };
  };
  const subs = (a: unknown) => arr(a).map(x => (x && typeof x === 'object'
    ? { id: uuid(), name: str(x.n), qty: optInt(x.q, 'sub.q') }
    : { id: uuid(), name: str(x) }));
  const customItem = (c: Raw, path: string, place: 'gear' | 'workshop') => {
    extra(c, CUSTOM_ITEM_KEYS, path);
    const qty = int(c.qty ?? 1, `${path}.qty`, 1, 1);
    const carried = place === 'workshop' ? 0 : qty > 1 ? Math.min(int(c.take, `${path}.take`, 0), qty) : c.base ? 0 : 1;
    return {
      id: uuid(), source: 'custom' as const, name: str(c.n), place, load: int(c.l, `${path}.l`, 0), qty, carried,
      open: !!c.open, note: str(c.note), props: props(c, c.armor, path), sub: subs(c.sub),
    };
  };
  const ownGear = arr(S.custom).map((c, i) => {
    const it = customItem(obj(c), `custom.${i}`, 'gear');
    gearKey.set('u' + i, it.id);
    return it;
  });
  const slots = (from: number) => [0, 1, 2].map(j => {
    const name = str(S.bandolier[from + j]);
    const stock = name.trim() ? ownGear.find(c => c.name.trim() === name.trim()) : undefined;
    return { name, qty: optInt(S.bandQ[from + j], `bandQ.${from + j}`), itemId: stock?.id };
  });
  const bookItem = (k: string, place: 'gear' | 'workshop') => {
    const def = P.ITEMS[k];
    if (!def) warnings.push(`items: unknown book item key "${k}", imported as a custom item`);
    const qty = int(S.bqty[k] ?? 1, `bqty.${k}`, 1, 1);
    const carried = place === 'workshop' ? 0 : qty > 1 ? Math.min(int(S.btake[k], `btake.${k}`, 0), qty) : S.base.includes(k) ? 0 : 1;
    const name: string | undefined = S.nameOv[k] ?? (def?.rename || !def?.id ? def?.name ?? k : undefined);
    return {
      id: uuid(), source: def?.id ? 'book' as const : 'custom' as const, bookId: def?.id ?? undefined, name, place,
      load: empty(S.loadOv[k]) ? def?.load ?? 0 : int(S.loadOv[k], `loadOv.${k}`, 0), qty, carried,
      open: S.open.includes(k), note: str(S.itemNotes[k]),
      props: props(obj(S.itemProps[k]), S.armorOv[k], `itemProps.${k}`), sub: subs(S.subOv[k]),
      slots: k === 's3' ? slots(0) : undefined,
    };
  };
  const bookGear = S.items.map((k: string) => { const it = bookItem(k, 'gear'); gearKey.set(k, it.id); return it; });
  const usedKeys = new Set<string>(S.items);
  const workshop = arr(S.ws).map((c, i) => {
    if (c?.book) { usedKeys.add(c.book); return bookItem(c.book, 'workshop'); }
    return customItem(obj(c), `ws.${i}`, 'workshop');
  });
  const projects = arr(S.prod).map((c: Raw, i) => {
    const path = `prod.${i}`;
    extra(obj(c), ['n', 'v', 'm', 'q', 'l', 'sub', 'note', 'open', 'armor', ...PROP_KEYS], path);
    return {
      id: uuid(), name: str(c?.n), done: optInt(c?.v, `${path}.v`), total: optInt(c?.m, `${path}.m`),
      qty: int(c?.q ?? 1, `${path}.q`, 1), load: int(c?.l ?? 1, `${path}.l`, 1), open: !!c?.open, note: str(c?.note),
      props: props(obj(c), c?.armor, path), sub: subs(c?.sub),
    };
  });
  const extraItems: (ReturnType<typeof customItem> & { slots: ReturnType<typeof slots> })[] = [];
  if ([3, 4, 5].some(i => str(S.bandolier[i]) || !empty(S.bandQ[i]))) {
    extraItems.push({ ...customItem({ n: P.ITEMS.s4.name, l: S.loadOv.s4 ?? P.ITEMS.s4.load, base: true }, 'bandolier2', 'gear'), slots: slots(3) });
    warnings.push('second bandolier (hidden in the prototype) kept as a custom item at base');
  }
  // per-book-item overrides of items no longer on the sheet: the prototype keeps them for a re-add
  const meaningful = (v: unknown): boolean => (Array.isArray(v) ? v.some(meaningful)
    : v && typeof v === 'object' ? Object.values(v).some(meaningful) : v !== '' && v != null && v !== false);
  for (const m of ['itemNotes', 'nameOv', 'subOv', 'itemProps', 'armorOv', 'loadOv'])
    for (const [k, v] of Object.entries(obj(S[m]))) if (!usedKeys.has(k) && meaningful(v)) left(`${m}.${k}`, v, 'belongs to a removed book item');
  for (const [k, p] of Object.entries(obj(S.itemProps))) extra(obj(p), PROP_KEYS, `itemProps.${k}`);

  const armorUsed: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(S.armorUsed))) {
    const id = gearKey.get(k), n = int(v, `armorUsed.${k}`, 0);
    if (id) { if (n) armorUsed[id] = n; } else if (n) left(`armorUsed.${k}`, v, 'no such item');
  }
  // legacy armor checkboxes a (Armor) / h (Heavy)
  for (const [f, k] of [['a', 'c6'], ['h', 'c7']] as const) {
    const n = int(S.armor?.[f], `armor.${f}`, 0);
    if (!n) continue;
    if (gearKey.has(k) && !armorUsed[gearKey.get(k)!]) armorUsed[gearKey.get(k)!] = n;
    else left(`armor.${f}`, n, 'legacy armor box without a matching item');
  }

  // counters in display order (ctrOrder), unknown order keys ignored
  const order = arr(S.ctrOrder);
  const pos = (c: Raw) => { const i = order.indexOf('c:' + c.id); return i < 0 ? Infinity : i; };
  const counters: Counter[] = [...S.counters].sort((a, b) => pos(a) - pos(b)).map((c: Raw, i) => {
    const path = `counters.${i}`;
    extra(c, ['id', 'n', 'v', 'max', 'r', 'h', 'from'], path);
    let max = optInt(c.max, `${path}.max`, 0);
    if (max === 0) { left(`${path}.max`, 0, 'max 0 stored as no limit'); max = undefined; }
    let value = int(c.v, `${path}.v`, 0);
    if (max !== undefined && value > max) { left(`${path}.v`, value, `stored as ${max} (over max)`); value = max; }
    const reset = c.r === 'none' ? 'manual' : ['day', 'downtime', 'score'].includes(c.r) ? c.r : 'manual';
    if (!['day', 'downtime', 'score', 'none'].includes(c.r)) left(`${path}.r`, c.r, 'unknown reset, stored as manual');
    const fromTalent = c.from ? talentRef(c.from) : undefined;
    if (c.from && !fromTalent) left(`${path}.from`, c.from, 'unknown talent');
    return { id: uuid(), name: str(c.n), value, max, reset, hint: c.h ? str(c.h) : undefined, fromTalent };
  });

  const specialArmorUsed: Record<string, boolean> = {};
  for (const [t, v] of Object.entries(obj(S.spec))) {
    const ref = talentRef(t);
    if (ref) specialArmorUsed[ref] = !!v; else left(`spec.${t}`, v, 'unknown talent');
  }

  const customTraumas = [...new Set(arr(S.traumaExtra).map(str).filter(Boolean))].map(name => ({ id: uuid(), name }));
  const trauma: string[] = [];
  for (const t of arr(S.trauma).map(str).filter(Boolean)) {
    let id = P.TRAUMAS[t] ?? customTraumas.find(x => x.name === t)?.id;
    if (!id) { const ct = { id: uuid(), name: t }; customTraumas.push(ct); id = ct.id; }
    if (!trauma.includes(id)) trauma.push(id);
  }

  const friends: Record<string, 'up' | 'down'> = {};
  const contacts: Contact[] = arr(S.contacts).map((c, i) => {
    extra(obj(c), ['id', 'n', 'rel'], `contacts.${i}`);
    return { id: uuid(), name: str(c?.n), rel: c?.rel === 'down' ? 'down' : 'up', note: '' };
  });
  for (const [name, rel] of Object.entries(obj(S.friends))) {
    if (rel !== 'up' && rel !== 'down') continue; // '' = hidden
    const id = P.FRIENDS[name];
    if (id) friends[id] = rel;
    else { contacts.push({ id: uuid(), name, rel, note: '' }); warnings.push(`friends: "${name}" is not a book friend, imported as a contact`); }
  }

  const plan = (p: Raw, path: string) => {
    const shape = (s: Raw) => {
      const id = uuid();
      switch (s?.k) {
        case 'r': return { id, kind: 'room', x: s.x, y: s.y, w: s.w, h: s.h, label: str(s.t) };
        case 'i': return { id, kind: 'image', x: s.x, y: s.y, w: s.w, h: s.h, src: s.src };
        case 'l': return { id, kind: ['wall', 'door', 'window'][s.d ?? 0], x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
        case 'p': return { id, kind: 'pen', points: s.pts };
        case 't': return { id, kind: 'text', x: s.x, y: s.y, text: str(s.t) };
        case 'm': return { id, kind: 'mark', x: s.x, y: s.y, glyph: str(s.g), label: str(s.t) };
      }
      return s;
    };
    const floors = arr(p.floors).map((f, fi) => ({
      id: uuid(), name: str(f?.n),
      shapes: arr(f?.s).flatMap((s, si) => {
        const r = Shape.safeParse(shape(s));
        if (r.success) return [r.data];
        left(`${path}.floors.${fi}.s.${si}`, s, 'invalid shape');
        return [];
      }),
    }));
    const v = obj(p.v), zoom = num(v.z);
    return {
      floors, current: Math.min(floors.length - 1, int(p.f, `${path}.f`, 0)),
      view: { x: Number.isFinite(num(v.x)) ? num(v.x) : 40, y: Number.isFinite(num(v.y)) ? num(v.y) : 40, zoom: zoom > 0 ? zoom : 1 },
    };
  };
  const cards = arr(S.cards).map((c: Raw, i) => {
    const path = `cards.${i}`;
    extra(obj(c), ['t', 'x', 'pin', 'rule', 'imgs', 'plan'], path);
    const images = arr(c?.imgs).flatMap((src, j) => {
      const r = CardImage.safeParse({ id: uuid(), src });
      if (r.success) return [r.data];
      left(`${path}.imgs.${j}`, src, 'not a data:image URL');
      return [];
    });
    return {
      id: uuid(), kind: c?.rule ? 'rule' as const : 'note' as const, title: str(c?.t), text: str(c?.x), pinned: !!c?.pin,
      images, plan: c?.plan ? plan(obj(c.plan), `${path}.plan`) : undefined,
    };
  });

  const origin = (text: unknown, note: unknown, table: Record<string, string>) => {
    const t = str(text), key = t.trim().toLowerCase();
    const hit = Object.keys(table).find(n => key === n.toLowerCase())
      ?? Object.keys(table).find(n => key.startsWith(n.toLowerCase()) && !/[\p{L}]/u.test(key[n.length] ?? ''));
    if (!t.trim()) return { note: str(note), ...(t ? { name: t } : {}) };
    if (!hit) return { name: t, note: str(note) };
    return { bookId: table[hit], ...(key === hit.toLowerCase() ? {} : { name: t }), note: str(note) };
  };

  const actions: Record<string, number> = {};
  for (const [name, v] of Object.entries(obj(S.actions))) {
    const id = P.ACTIONS[name];
    if (id) actions[id] = int(v, `actions.${name}`, 0, 0, 4); else left(`actions.${name}`, v, 'unknown action');
  }
  const xp = { insight: 0, prowess: 0, resolve: 0, playbook: 0 };
  for (const [k, v] of Object.entries(obj(S.xp))) {
    const track = P.XP[k];
    if (track) xp[track] = int(v, `xp.${k}`, 0, 0, track === 'playbook' ? Infinity : 6); else left(`xp.${k}`, v, 'unknown XP track');
  }
  const load = ({ 3: 'light', 5: 'normal', 6: 'heavy' } as const)[num(S.load) as 3 | 5 | 6];
  if (!load) left('load', S.load, 'unknown load, stored as light');

  // rules
  const R = S.rules;
  extra(R, RULE_KEYS, 'rules');
  const stage = ['creation', 'play', 'mastery', 'free'].includes(R.stage) ? R.stage : 'creation';
  if (stage !== R.stage) left('rules.stage', R.stage, 'unknown stage, stored as creation');
  const venom = P.TALENT_PRESETS['Ядовитость'];
  const rules = TableRules.parse({
    mode: R.mode === 'book' ? 'book' : 'custom',
    money: { book: !!R.money, major: str(R.major), minor: str(R.minor), rate: int(R.rate, 'rules.rate', 1, 1) },
    stress: { book: !!R.stress, boxes: int(R.stressN, 'rules.stressN', 9, 1, 20) },
    playbookXpBoxes: int(R.talentXP, 'rules.talentXP', 8, 1, 40),
    load: !!R.carry,
    bandolier: R.band ? 'book' : 'own-items',
    presets: R.presets ? 'book' : 'book+own',
    talentPresets: { [P.TALENTS['Ядовитость']]: { name: venom.n, reset: venom.r === 'none' ? 'manual' : venom.r, hint: venom.h } },
    dayCounter: !!R.day,
    downtime: {
      book: !R.rest2,
      options: [
        { id: uuid(), name: '+1 лечение, −1 стресс', healing: 1, stressRelief: 1 },
        { id: uuid(), name: '−2 стресса', healing: 0, stressRelief: 2 },
      ],
    },
    skillStage: stage,
    crewTier: int(R.tier, 'rules.tier', 0, 0, 6),
    foreignTalentCost: 1,
  });

  for (const k of Object.keys(S)) if (!(k in fresh()) && !UI_KEYS.includes(k)) left(k, S[k], 'unknown field');
  extra(obj(S.armor), ['a', 'h', 's'], 'armor');

  const doc = {
    id: uuid(), schemaVersion: 1, campaignId: opts.campaignId, playbookId: opts.playbookId ?? P.PLAYBOOK,
    name: str(S.name), alias: str(S.alias), look: str(S.look), notes: str(S.bioNote), day: int(S.day, 'day', 1, 1),
    heritage: origin(S.heritage, S.heritageNote, P.HERITAGES),
    background: origin(S.background, S.backgroundNote, P.BACKGROUNDS),
    vice: origin(S.vice, S.viceNote, P.VICES),
    friends, contacts, actions, xp, talents, customTalents,
    stress: int(S.stress, 'stress', 0), trauma, customTraumas,
    harm: { l3: str(S.h3), l2: [str(S.h2a), str(S.h2b)], l1: [str(S.h1a), str(S.h1b)] },
    healing: int(S.heal, 'heal', 0, 0, 4), armorUsed, specialArmorUsed,
    money: { coins: int(S.coin, 'coin', 0, 0, 4), stash: int(S.stash, 'stash', 0, 0, 40), major: int(S.dr, 'dr', 0), minor: int(S.drm, 'drm', 0) },
    load: load ?? 'light',
    items: [...bookGear, ...ownGear, ...extraItems, ...workshop],
    workshop: projects,
    counters,
    presetsApplied: [...new Set(arr(S.presetDone).map(talentRef).filter(Boolean))],
    cards,
  } satisfies CharacterInput;

  // last: every clamp/skip above has reported into `leftovers` by now
  if (Object.keys(leftovers).length)
    cards.push({ id: uuid(), kind: 'note', title: LEFTOVERS_TITLE, text: JSON.stringify(leftovers, null, 1), pinned: true, images: [], plan: undefined });
  const character = Character.parse(doc);

  return {
    character, rules, warnings,
    ui: { tips: !!S.tips, rbPage: Number.isFinite(num(S.rbPage)) ? num(S.rbPage) : undefined, noteView: S.noteView === undefined ? undefined : S.noteView !== false },
  };
}

// Character document: the whole sheet as one JSON value (characters.doc).
// Book entities are referenced by content id; custom ones carry a UUID and the same mechanical fields.
// Strict objects throughout: an unknown key is a validation error, never silently dropped.
// Defaults that are objects/arrays use factories, so parses never share one instance.
import { z } from 'zod';
import { ContentId, CounterPreset, CounterReset, EntityRef, Flaw, ItemType, TalentMods, Uuid } from './common';
import { TableRulesOverride } from './rules';

export const SCHEMA_VERSION = 1;

/** Heritage / background / vice: a book id, or a custom name; plus free details (family, patron…). */
export const Origin = z.strictObject({
  bookId: ContentId.optional(),
  name: z.string().optional(), // custom name, or rename of the book one
  note: z.string().default(''),
});

/** Friend or rival: a playbook NPC (`bookId`; `name` = rename) or a custom one (`name`). */
export const Contact = z.strictObject({
  id: Uuid,
  bookId: ContentId.optional(),
  name: z.string().optional(),
  rel: z.enum(['up', 'down']),
  note: z.string().default(''),
});

/** Same mechanics as a book talent: special armor checkbox, counter preset, engine mods. */
export const CustomTalent = z.strictObject({
  id: Uuid,
  name: z.string(),
  text: z.string().default(''),
  specialArmor: z.boolean().default(false),
  counter: CounterPreset.optional(),
  mods: TalentMods.optional(),
});

/** Same as a book trauma: a name and its description. */
export const CustomTrauma = z.strictObject({ id: Uuid, name: z.string().min(1), text: z.string().default('') });

export const ItemProps = z.strictObject({
  type: ItemType.optional(), // absent = ordinary
  quality: z.int().min(0).max(6).optional(), // absent = crew tier
  fine: z.boolean().default(false),
  uses: z.int().min(0).optional(), // absent = unlimited
  usesLeft: z.int().min(0).optional(),
  armor: z.int().min(0).optional(), // absent = book default (Armor/Heavy: 1)
  gives: z.string().default(''),
  flaws: z.array(Flaw).default(() => []),
});

const noProps = () => ({ fine: false, gives: '', flaws: [] });

export const SubItem = z.strictObject({ id: Uuid, name: z.string(), qty: z.int().min(0).optional() });

/** Bandolier slot: what is loaded and how much; itemId links to the stock item it is drawn from. */
export const Slot = z.strictObject({ name: z.string(), qty: z.int().min(0).optional(), itemId: Uuid.optional() });

/** Book item when `bookId` is set, custom otherwise. */
export const Item = z.strictObject({
  id: Uuid,
  bookId: ContentId.optional(),
  name: z.string().optional(), // book: rename (absent = localized book name); custom: the name
  place: z.enum(['gear', 'workshop']).default('gear'),
  load: z.int().min(0), // per piece
  qty: z.int().min(1).default(1),
  carried: z.int().min(0).default(1), // how many are on you; the rest stay at base
  open: z.boolean().default(false), // contents expanded
  note: z.string().default(''),
  props: ItemProps.default(noProps),
  sub: z.array(SubItem).optional(), // absent = book contents (none for custom); [] = emptied by the user
  slots: z.array(Slot).optional(),
}).refine(i => i.carried <= i.qty, { message: 'carried exceeds qty', path: ['carried'] });

/** Workshop project: progress done/total, quantity being made. Moves to gear as a custom Item. */
export const WorkItem = z.strictObject({
  id: Uuid,
  name: z.string(),
  done: z.int().min(0).optional(),
  total: z.int().min(0).optional(),
  qty: z.int().min(0).default(1),
  load: z.int().min(0).default(1),
  open: z.boolean().default(false),
  note: z.string().default(''),
  props: ItemProps.default(noProps),
  sub: z.array(SubItem).default(() => []),
});

export const Counter = z.strictObject({
  id: Uuid,
  name: z.string(),
  value: z.int().min(0),
  max: z.int().min(0).optional(), // absent = no limit; 0 = capped at 0 (the prototype allows it)
  reset: CounterReset,
  fromTalent: EntityRef.optional(),
  hint: z.string().optional(),
}).refine(c => c.max === undefined || c.value <= c.max, { message: 'value exceeds max', path: ['value'] });

/** Raster image as a data URL (no remote content: strict CSP). */
const ImageSrc = z.string().regex(/^data:image\/[a-z0-9.+-]+[;,]/, 'images must be data:image URLs');

const Pt = z.number();
export const Shape = z.discriminatedUnion('kind', [
  z.strictObject({ id: Uuid, kind: z.literal('room'), x: Pt, y: Pt, w: Pt, h: Pt, label: z.string().default('') }),
  z.strictObject({ id: Uuid, kind: z.literal('image'), x: Pt, y: Pt, w: Pt, h: Pt, src: ImageSrc }),
  z.strictObject({ id: Uuid, kind: z.enum(['wall', 'door', 'window']), x1: Pt, y1: Pt, x2: Pt, y2: Pt }), // door hinges at (x1,y1)
  z.strictObject({ id: Uuid, kind: z.literal('pen'), points: z.array(z.tuple([Pt, Pt])).min(2) }),
  z.strictObject({ id: Uuid, kind: z.literal('text'), x: Pt, y: Pt, text: z.string() }),
  z.strictObject({ id: Uuid, kind: z.literal('mark'), x: Pt, y: Pt, glyph: z.string().min(1), label: z.string().default('') }),
]);

export const Floor = z.strictObject({ id: Uuid, name: z.string(), shapes: z.array(Shape).default(() => []) });

export const FloorPlan = z.strictObject({
  floors: z.array(Floor).min(1),
  current: z.int().min(0).default(0), // selected floor index
  view: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number().positive() }).default(() => ({ x: 40, y: 40, zoom: 1 })),
});

export const CardImage = z.strictObject({ id: Uuid, src: ImageSrc, name: z.string().optional() });

/** Note or table-rule card (rules tab shows kind 'rule'). */
export const Card = z.strictObject({
  id: Uuid,
  kind: z.enum(['note', 'rule']).default('note'),
  title: z.string().default(''),
  text: z.string().default(''),
  pinned: z.boolean().default(false),
  plan: FloorPlan.optional(),
  images: z.array(CardImage).default(() => []),
});

const HarmLine = z.string().default('');

/** The campaign link is the `characters.campaign_id` column, not part of the document. */
export const Character = z.strictObject({
  id: Uuid,
  schemaVersion: z.literal(SCHEMA_VERSION),
  playbookId: ContentId,
  name: z.string().default(''),
  alias: z.string().default(''),
  look: z.string().default(''),
  notes: z.string().default(''), // biography notes
  day: z.int().min(1).default(1),

  heritage: Origin.default(() => ({ note: '' })),
  background: Origin.default(() => ({ note: '' })),
  vice: Origin.default(() => ({ note: '' })),
  contacts: z.array(Contact).default(() => []), // playbook friends/rivals marked on the sheet, and custom ones

  actions: z.record(ContentId, z.int().min(0).max(4)),
  xp: z.strictObject({
    insight: z.int().min(0).max(6),
    prowess: z.int().min(0).max(6),
    resolve: z.int().min(0).max(6),
    playbook: z.int().min(0), // limit is rules.playbookXpBoxes
  }).default(() => ({ insight: 0, prowess: 0, resolve: 0, playbook: 0 })),

  talents: z.array(ContentId).default(() => []), // book talents of any playbook (foreign = veteran); custom ones: customTalents
  customTalents: z.array(CustomTalent).default(() => []),

  stress: z.int().min(0).default(0),
  trauma: z.array(EntityRef).default(() => []), // book trauma ids or customTraumas ids
  customTraumas: z.array(CustomTrauma).default(() => []),
  harm: z.strictObject({
    l3: HarmLine,
    l2: z.tuple([HarmLine, HarmLine]),
    l1: z.tuple([HarmLine, HarmLine]),
  }).default(() => ({ l3: '', l2: ['', ''] as [string, string], l1: ['', ''] as [string, string] })),
  healing: z.int().min(0).max(4).default(0),
  armorUsed: z.record(Uuid, z.int().min(0)).default(() => ({})), // item id → used boxes; cleared on a new score
  specialArmorUsed: z.record(EntityRef, z.boolean()).default(() => ({})), // talent id → used; cleared by downtime

  // Both book and custom money are kept; rules.money.book picks which one is shown.
  money: z.strictObject({
    coins: z.int().min(0).max(4),
    stash: z.int().min(0).max(40),
    major: z.int().min(0),
    minor: z.int().min(0),
  }).default(() => ({ coins: 0, stash: 0, major: 0, minor: 0 })),
  load: z.enum(['light', 'normal', 'heavy']).default('light'),

  items: z.array(Item).default(() => []),
  workshop: z.array(WorkItem).default(() => []),
  counters: z.array(Counter).default(() => []), // array order = display order
  presetsApplied: z.array(EntityRef).default(() => []), // talents whose preset counter was already added once
  cards: z.array(Card).default(() => []),

  // A sheet without a campaign keeps its own rules; deleting a campaign copies its rules here.
  rulesOverride: TableRulesOverride.optional(),
});

export type Origin = z.infer<typeof Origin>;
export type Contact = z.infer<typeof Contact>;
export type CustomTalent = z.infer<typeof CustomTalent>;
export type CustomTrauma = z.infer<typeof CustomTrauma>;
export type ItemProps = z.infer<typeof ItemProps>;
export type SubItem = z.infer<typeof SubItem>;
export type Slot = z.infer<typeof Slot>;
export type Item = z.infer<typeof Item>;
export type WorkItem = z.infer<typeof WorkItem>;
export type Counter = z.infer<typeof Counter>;
export type Shape = z.infer<typeof Shape>;
export type Floor = z.infer<typeof Floor>;
export type FloorPlan = z.infer<typeof FloorPlan>;
export type CardImage = z.infer<typeof CardImage>;
export type Card = z.infer<typeof Card>;
export type Character = z.infer<typeof Character>;
/** Input shape (defaults optional) — what an importer or the agent may write. */
export type CharacterInput = z.input<typeof Character>;

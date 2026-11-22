// Book content schemas. `content/core/*` holds language-independent data (ids, numbers, links);
// `content/<lang>/*` holds texts keyed by the same ids (LocaleTexts).
import { z } from 'zod';
import { Attribute, ContentId, CounterReset, Flaw, ItemType, TalentMods } from './common';

const ActionRatings = z.record(ContentId, z.int().min(0).max(4));

export const Action = z.object({ id: ContentId, attribute: Attribute });

/** Special ability of a playbook or crew (also Hull features, Vampire strictures, advanced abilities). */
export const Talent = z.object({
  id: ContentId,
  owner: ContentId.optional(), // playbook or crew id; absent for advanced abilities
  group: z.enum(['ability', 'feature', 'stricture', 'advanced']).default('ability'),
  specialArmor: z.boolean().default(false),
  counter: z.object({ max: z.int().min(1).optional(), reset: CounterReset }).optional(), // name/hint in locale
  mods: TalentMods.optional(),
});

/** Standard item (pp. 104–105) or playbook special item. Contents list is localized text. */
export const ContentItem = z.object({
  id: ContentId,
  load: z.int().min(0),
  armor: z.int().min(0).optional(), // armor boxes it gives when carried
  bandolierSlots: z.int().min(0).optional(), // alchemist's bandolier: 3
});

/** Crafted thing (pp. 269–274): standard creation, or an example recipe/schematic/ritual. */
export const Creation = z.object({
  id: ContentId,
  kind: z.enum(['standard', 'recipe', 'schematic', 'ritual']),
  category: ContentId, // bomb, drug, potion, oil, poison, device…
  type: ItemType,
  quality: z.int().min(0).max(6),
  uses: z.int().min(1).optional(),
  flaws: z.array(Flaw).default([]),
});

/** Heritage, background, vice, trauma, NPC, flaw, crew reputation: an id whose meaning is all text. */
export const Named = z.object({ id: ContentId });

export const Playbook = z.object({
  id: ContentId,
  kind: z.enum(['standard', 'special']).default('standard'), // special: ghost, hull, vampire
  startingActions: ActionRatings,
  stressBoxes: z.int().min(0).optional(), // vampire 12; ghost/hull rename stress via locale
  talents: z.array(Talent).min(1),
  items: z.array(ContentItem),
  friends: z.array(ContentId), // NPC ids
  builds: z.array(z.object({ id: ContentId, actions: ActionRatings, talent: ContentId })).default([]),
});

export const CrewType = z.object({
  id: ContentId,
  talents: z.array(Talent).min(1),
  upgrades: z.array(z.object({
    id: ContentId,
    group: z.enum(['crew', 'lair', 'quality', 'training', 'cohort']),
    boxes: z.int().min(1).default(1),
  })),
  startingUpgrades: z.array(ContentId).default([]),
  contacts: z.array(ContentId),
  huntingGrounds: z.array(ContentId),
  claims: z.array(z.object({
    id: ContentId,
    row: z.int().min(0),
    col: z.int().min(0),
    lair: z.boolean().default(false),
    links: z.array(ContentId).default([]),
  })),
});

/** Character creation limits (pp. 66–72). */
export const CreationRules = z.object({
  freeActionDots: z.int().min(0), // 4 on top of the playbook's 3
  maxRatingAtCreation: z.int().min(1).max(4), // 2
  talents: z.int().min(1), // 1
});

/** content/core/common.json */
export const CommonContent = z.object({
  actions: z.array(Action).length(12),
  items: z.array(ContentItem),
  traumas: z.array(Named),
  heritages: z.array(Named),
  backgrounds: z.array(Named),
  vices: z.array(Named),
  flaws: z.array(Named),
  creations: z.array(Creation),
  creation: CreationRules,
});

/** Texts of one entity in one language. Fields are optional because entities need different ones. */
export const EntityText = z.object({
  name: z.string().min(1),
  short: z.string().optional(),
  text: z.string().optional(),
  page: z.int().min(1).optional(), // book page in this edition
  list: z.array(z.string()).optional(), // item contents, gather-information questions
  xpTrigger: z.string().optional(),
  counter: z.object({ name: z.string(), hint: z.string().optional() }).optional(),
});

/** content/<lang>/*.json: id → texts. */
export const LocaleTexts = z.record(ContentId, EntityText);

export type Action = z.infer<typeof Action>;
export type Talent = z.infer<typeof Talent>;
export type ContentItem = z.infer<typeof ContentItem>;
export type Creation = z.infer<typeof Creation>;
export type Named = z.infer<typeof Named>;
export type Playbook = z.infer<typeof Playbook>;
export type CrewType = z.infer<typeof CrewType>;
export type CreationRules = z.infer<typeof CreationRules>;
export type CommonContent = z.infer<typeof CommonContent>;
export type EntityText = z.infer<typeof EntityText>;
export type LocaleTexts = z.infer<typeof LocaleTexts>;

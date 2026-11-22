// "Table rules": book mechanics are defaults; mode 'book' forces every `book` flag on (engine's job).
// Custom values are kept even while a book flag is on, so toggling never loses them.
import { z } from 'zod';
import { ContentId, CounterPreset, Uuid } from './common';

export const DowntimeOption = z.strictObject({
  id: Uuid,
  name: z.string(),
  healing: z.int().min(0), // segments on the healing clock
  stressRelief: z.int().min(0),
});

const fields = {
  mode: z.enum(['book', 'custom']),
  money: z.strictObject({
    book: z.boolean(), // coin + stash (p. 54)
    major: z.string(),
    minor: z.string(),
    rate: z.int().min(1), // minor per major
  }),
  stress: z.strictObject({ book: z.boolean(), boxes: z.int().min(1).max(20) }), // book: 9 (+1 Survivor)
  playbookXpBoxes: z.int().min(1).max(40), // book: 8
  load: z.boolean(), // book: light 3 / normal 5 / heavy 6 (p. 72); false = carry anything, load not counted
  bandolier: z.enum(['book', 'own-items']),
  presets: z.enum(['book', 'book+own']),
  talentPresets: z.record(ContentId, CounterPreset), // the table's own counter presets, by book talent
  dayCounter: z.boolean(),
  downtime: z.strictObject({
    book: z.boolean(), // book: stress only via indulging a vice, healing via the healing activity
    options: z.array(DowntimeOption), // base choices of the table's downtime
  }),
  skillStage: z.enum(['creation', 'play', 'mastery', 'free']),
  crewTier: z.int().min(0).max(6),
  foreignTalentCost: z.union([z.literal(1), z.literal(2)]),
};

export const TableRules = z.strictObject(fields);
/** Sheet-level override: any subset of top-level rule groups. No defaults, so absent keys stay absent. */
export const TableRulesOverride = z.strictObject(fields).partial();

export type DowntimeOption = z.infer<typeof DowntimeOption>;
export type TableRules = z.infer<typeof TableRules>;
export type TableRulesOverride = z.infer<typeof TableRulesOverride>;

export const BOOK_RULES: TableRules = {
  mode: 'book',
  money: { book: true, major: '', minor: '', rate: 1 },
  stress: { book: true, boxes: 9 },
  playbookXpBoxes: 8,
  load: true,
  bandolier: 'book',
  presets: 'book',
  talentPresets: {},
  dayCounter: false,
  downtime: { book: true, options: [] },
  skillStage: 'creation',
  crewTier: 0,
  foreignTalentCost: 1,
};

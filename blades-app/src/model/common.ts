import { z } from 'zod';

/** Stable id of a user entity (item, counter, card…). */
export const Uuid = z.uuid();

/** Language-independent id of book content: `leech`, `physicker`, `fine-tinkering-tools`. */
export const ContentId = z.string().regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, 'content id must be a lowercase slug');

/** A book entity (content id) or a custom one (UUID) — both go through the same mechanics. */
export const EntityRef = z.union([Uuid, ContentId]);

export const Attribute = z.enum(['insight', 'prowess', 'resolve']);

export const CounterReset = z.enum(['day', 'downtime', 'score', 'manual']);

/** Counter that a talent adds when taken. Same shape for book (texts from locale) and custom talents. */
export const CounterPreset = z.object({
  name: z.string(),
  max: z.int().min(1).optional(), // absent = no limit
  reset: CounterReset,
  hint: z.string().optional(),
});

/** Mechanical effects the engine applies; for book talents like Survivor (+1 stress) or Mule (more load). */
export const TalentMods = z.object({
  stressBoxes: z.int().optional(),
  traumaBoxes: z.int().optional(),
  load: z.object({ light: z.int(), normal: z.int(), heavy: z.int() }).optional(),
});

/** Book drawback ids (p. 271): unreliable, dangerous, suspicious, consumable, rare, complex — or custom text. */
export const Flaw = z.string().min(1);

export const ItemType = z.enum(['standard', 'alchemical', 'arcane', 'spark-craft']);

export type Attribute = z.infer<typeof Attribute>;
export type CounterReset = z.infer<typeof CounterReset>;
export type CounterPreset = z.infer<typeof CounterPreset>;
export type TalentMods = z.infer<typeof TalentMods>;
export type ItemType = z.infer<typeof ItemType>;

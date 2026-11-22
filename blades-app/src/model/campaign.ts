import { z } from 'zod';
import { Uuid } from './common';
import { TableRules } from './rules';

/** campaigns row: `rules` column holds TableRules; characters point here via campaignId. */
export const Campaign = z.object({
  id: Uuid,
  name: z.string().min(1),
  rules: TableRules,
});

/** rulings row: a GM decision, quoted word for word — never paraphrased. */
export const Ruling = z.object({
  id: Uuid,
  campaignId: Uuid,
  date: z.iso.date(),
  author: z.string().min(1),
  quote: z.string().min(1),
  topic: z.string().optional(),
});

export type Campaign = z.infer<typeof Campaign>;
export type Ruling = z.infer<typeof Ruling>;

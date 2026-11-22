import type { Action, Attribute } from '../model';

/** Attribute rating = number of its actions rated 1 or more. */
export function attributes(actions: Record<string, number>, defs: Action[]): Record<Attribute, number> {
  const out: Record<Attribute, number> = { insight: 0, prowess: 0, resolve: 0 };
  for (const a of defs) if ((actions[a.id] ?? 0) > 0) out[a.attribute]++;
  return out;
}

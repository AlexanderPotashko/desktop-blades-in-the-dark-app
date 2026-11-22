import type { TableRules } from '../model';

const CAP = { creation: 2, play: 3, mastery: 4, free: null } as const;
export const CREATION_DOTS = 7; // 3 from the playbook + 4 free (p. 69)

export interface StageCheck { cap: number | null; points: number; maxPoints: number | null; over: string[]; ok: boolean }

/** Action limits of the skill stage: creation 7 dots / max 2, play 3, mastery 4, free none. */
export function stageCheck(actions: Record<string, number>, stage: TableRules['skillStage']): StageCheck {
  const cap = CAP[stage];
  const points = Object.values(actions).reduce((s, v) => s + v, 0);
  const maxPoints = stage === 'creation' ? CREATION_DOTS : null;
  const over = cap === null ? [] : Object.keys(actions).filter(a => actions[a] > cap);
  return { cap, points, maxPoints, over, ok: over.length === 0 && (maxPoints === null || points <= maxPoints) };
}

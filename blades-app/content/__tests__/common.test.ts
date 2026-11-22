import { describe, expect, it } from 'vitest';
import core from '../core/common.json';
import ru from '../ru/common.json';
import { CommonContent, LocaleTexts } from '../../src/model';

describe('content/common', () => {
  const c = CommonContent.parse(core);
  const t = LocaleTexts.parse(ru);

  it('ru keys == core ids', () => {
    const ids = [c.actions, c.items, c.traumas, c.heritages, c.backgrounds, c.vices, c.flaws, c.creations]
      .flat()
      .map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(t).sort()).toEqual([...ids].sort());
  });

  it('creation flaws are known ids', () => {
    const known = new Set(c.flaws.map((f) => f.id));
    for (const cr of c.creations) for (const f of cr.flaws) expect(known.has(f), `${cr.id}: ${f}`).toBe(true);
  });
});

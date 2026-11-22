import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

it('ids are unique across all content/core files', () => {
  const dir = join(__dirname, '../core');
  const files = ['common.json', ...readdirSync(join(dir, 'playbooks')).map((f) => `playbooks/${f}`)];
  const ids: string[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (typeof r.id === 'string') ids.push(r.id);
      if (Array.isArray(r.friends)) ids.push(...(r.friends as string[]));
      Object.values(r).forEach(walk);
    }
  };
  for (const f of files) walk(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
});

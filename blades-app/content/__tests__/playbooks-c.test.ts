import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LocaleTexts, Playbook } from '../../src/model/content';

const dir = join(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf8'));

describe.each(['slide', 'spider', 'whisper'])('playbook %s', (id) => {
  const core = Playbook.parse(read(`core/playbooks/${id}.json`));
  const ru = LocaleTexts.parse(read(`ru/playbooks/${id}.json`));

  it('core and ru keys match', () => {
    const keys = [core.id, ...core.talents.map((t) => t.id), ...core.items.map((i) => i.id), ...core.friends, ...core.builds.map((b) => b.id)];
    expect(Object.keys(ru).sort()).toEqual([...keys].sort());
  });
  it('builds point at own talents', () => {
    for (const b of core.builds) expect(core.talents.map((t) => t.id)).toContain(b.talent);
  });
});

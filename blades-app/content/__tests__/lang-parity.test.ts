import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LocaleTexts } from '../../src/model/content';

const dir = join(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
const langs = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !['core', '__tests__', 'ru'].includes(d.name))
  .map((d) => d.name);
const files = ['common.json', ...readdirSync(join(dir, 'ru/playbooks')).map((f) => `playbooks/${f}`)];

// same entity ids, same fields in each entity, same list lengths
const shape = (t: LocaleTexts) =>
  Object.fromEntries(
    Object.entries(t).map(([id, e]) => [
      id,
      { fields: Object.keys(e).sort(), list: e.list?.length, counter: e.counter && Object.keys(e.counter).sort() },
    ]),
  );

describe.each(langs)('language %s mirrors ru', (lang) => {
  it.each(files)('%s', (f) => {
    expect(existsSync(join(dir, lang, f)), `${lang}/${f} missing`).toBe(true);
    const ru = LocaleTexts.parse(read(`ru/${f}`));
    const other = LocaleTexts.parse(read(`${lang}/${f}`));
    expect(Object.keys(other).sort()).toEqual(Object.keys(ru).sort());
    expect(shape(other)).toEqual(shape(ru));
    for (const [id, e] of Object.entries(other)) expect(e.page, id).toBe(ru[id].page);
  });
  it('has no extra files', () => {
    const extra = readdirSync(join(dir, lang, 'playbooks')).map((f) => `playbooks/${f}`);
    expect(extra.sort()).toEqual(files.filter((f) => f !== 'common.json').sort());
  });
});

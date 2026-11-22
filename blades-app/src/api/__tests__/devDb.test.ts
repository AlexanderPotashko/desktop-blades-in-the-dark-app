// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import * as db from '../db';
import { newCharacter } from '../../store/actions';

beforeEach(() => localStorage.clear());

it('outside Tauri the wrappers run on the localStorage emulation: save, load, revisions, settings, errors', async () => {
  const c = newCharacter('leech', { name: 'Sandr' });
  await db.saveCharacter(c);
  expect(await db.getCharacter(c.id)).toEqual(c);
  expect((await db.listCharacters()).map((r) => [r.id, r.name, r.playbook])).toEqual([[c.id, 'Sandr', 'leech']]);
  const rev = await db.saveRevision(c.id, 'test');
  expect((await db.getRevision(rev)).doc).toMatchObject({ id: c.id });
  await db.setSetting('ui', { lang: 'en' });
  expect(await db.getSetting('ui')).toEqual({ lang: 'en' });
  expect(await db.getSetting('nope')).toBeUndefined();
  await expect(db.getCharacter('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ kind: 'NotFound' });
  await db.deleteCharacter(c.id);
  expect(await db.listCharacters()).toEqual([]);
});

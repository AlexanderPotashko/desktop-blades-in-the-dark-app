// @vitest-environment jsdom
// Library operations on the dev fallback (localStorage emulation of the Rust commands).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../api/db';
import { parseBackupName, parseImport } from '../../engine/exchange';
import { resolveRules } from '../../engine/rules';
import { BOOK_RULES, type Campaign, type TableRules } from '../../model';
import { setLang } from '../../i18n';
import { newCharacter, setField } from '../actions';
import * as lib from '../library';
import { useStore } from '../store';
import { useUi } from '../ui';

const get = () => useStore.getState();
const custom = (p: Partial<TableRules> = {}): TableRules => ({ ...BOOK_RULES, mode: 'custom', ...p });
const uuid = () => crypto.randomUUID();

async function mk(name: string, campaignId?: string) {
  const c = newCharacter('leech', { name });
  await db.saveCharacter(c, campaignId);
  return c;
}
async function mkCampaign(name: string, rules = custom({ crewTier: 2 })): Promise<Campaign> {
  const c = { id: uuid(), name, rules };
  await db.saveCampaign(c);
  return c;
}
const names = async () => (await db.listCharacters(true)).map((r) => r.name).sort();

beforeEach(() => {
  localStorage.clear();
  setLang('ru');
  useStore.setState({ doc: null });
  useUi.setState({ lastCharacter: undefined, tab: 'library' });
});

describe('sheets', () => {
  it('switching saves pending edits of the sheet being left, then opens the other', async () => {
    const a = await mk('A');
    const b = await mk('B');
    await lib.openCharacter(a.id);
    setField('name', 'A edited');
    await lib.openCharacter(b.id);
    expect((await db.getCharacter(a.id)).name).toBe('A edited');
    expect(get().doc!.id).toBe(b.id);
    expect(useUi.getState().lastCharacter).toBe(b.id);
    expect(useUi.getState().tab).toBe('sheet');
  });

  it('duplicate makes a new UUID in the same campaign; archive hides; delete of the open sheet opens another', async () => {
    const camp = await mkCampaign('Irouvia');
    const a = await mk('A', camp.id);
    const b = await mk('B');
    const copyId = await lib.duplicateCharacter(a.id);
    expect(copyId).not.toBe(a.id);
    const rows = await db.listCharacters(true);
    expect(rows.find((r) => r.id === copyId)).toMatchObject({ name: 'A (копия)', campaignId: camp.id });

    await lib.setArchived(b.id, true);
    expect((await db.listCharacters()).map((r) => r.id)).not.toContain(b.id);
    expect((await db.listCharacters(true)).map((r) => r.id)).toContain(b.id);
    await lib.setArchived(b.id, false);

    await lib.openCharacter(a.id);
    await lib.removeCharacter(a.id);
    expect((await db.listCharacters(true)).map((r) => r.id)).not.toContain(a.id);
    expect(get().doc!.id).not.toBe(a.id); // another sheet took its place
  });
});

describe('campaign rules precedence', () => {
  it('campaign rules < sheet override; Settings edits the campaign; deleting copies rules into the sheets', async () => {
    const camp = await mkCampaign('Irouvia', custom({ crewTier: 2, playbookXpBoxes: 12 }));
    const a = await mk('A', camp.id);
    await lib.openCharacter(a.id);
    expect(get().campaignId).toBe(camp.id);
    expect(resolveRules(get().baseRules, get().doc!.rulesOverride)).toMatchObject({ crewTier: 2, playbookXpBoxes: 12 });

    // the sheet overrides one rule: the sheet wins there, the campaign elsewhere
    get().edit((d) => void (d.rulesOverride = { crewTier: 5 }));
    expect(resolveRules(get().baseRules, get().doc!.rulesOverride)).toMatchObject({ crewTier: 5, playbookXpBoxes: 12 });

    // editing "campaign rules" writes the campaign, not the sheet
    lib.setCampaignRule('playbookXpBoxes', 20);
    await get().flush();
    await vi.waitFor(async () => expect((await db.listCampaigns())[0].rules.playbookXpBoxes).toBe(20));
    expect(get().doc!.rulesOverride).toEqual({ crewTier: 5 });

    lib.clearRulesOverride();
    expect(resolveRules(get().baseRules, get().doc!.rulesOverride).crewTier).toBe(2);

    // delete: rules move into the sheet, the link is gone, the open sheet is reloaded
    await lib.removeCampaign(camp.id);
    expect(await db.listCampaigns()).toEqual([]);
    expect(get().campaignId).toBeUndefined();
    expect(get().doc!.rulesOverride).toMatchObject({ crewTier: 2, playbookXpBoxes: 20, mode: 'custom' });
    expect(resolveRules(get().baseRules, get().doc!.rulesOverride)).toMatchObject({ crewTier: 2, playbookXpBoxes: 20 });
  });

  it('adding and removing the open sheet as a member changes its base rules', async () => {
    const camp = await mkCampaign('C', custom({ crewTier: 4 }));
    const a = await mk('A');
    await lib.openCharacter(a.id);
    expect(get().baseRules).toEqual(BOOK_RULES);
    await lib.setMember(a.id, camp.id);
    expect(get().baseRules.crewTier).toBe(4);
    await lib.setMember(a.id, null);
    expect(get().baseRules).toEqual(BOOK_RULES);
    expect(get().campaignId).toBeUndefined();
  });
});

describe('rulings', () => {
  it('are stored verbatim and found by quote, author or topic', async () => {
    const camp = await mkCampaign('C');
    const quote = '  Порох у нас — редкость.\nНе проси бомбы.  ';
    await lib.addRuling(camp.id, { date: '2026-11-14', author: 'Хитрый_Лосось', quote, topic: 'порох' });
    await lib.addRuling(camp.id, { date: '2026-11-15', author: 'Хитрый_Лосось', quote: 'Врач лечит бесплатно', topic: '' });
    const list = await db.listRulings(camp.id);
    expect(list.find((r) => r.topic === 'порох')!.quote).toBe(quote);
    expect(list.find((r) => r.quote.startsWith('Врач'))!.topic).toBeUndefined();
    expect(list.filter((r) => lib.matchesRuling(r, 'ПОРОХ')).length).toBe(1);
    expect(list.filter((r) => lib.matchesRuling(r, 'лосось')).length).toBe(2);
    expect(list.filter((r) => lib.matchesRuling(r, '  ')).length).toBe(2);
  });
});

describe('history', () => {
  it('restoring saves a revision of the current state first, then puts the old version in place', async () => {
    const a = await mk('v1');
    await lib.openCharacter(a.id);
    const rev = await db.saveRevision(a.id, 'autosave');
    setField('name', 'v2');
    await lib.restoreRevision(a.id, rev);
    expect((await db.getCharacter(a.id)).name).toBe('v1');
    expect(get().doc!.name).toBe('v1'); // the open sheet shows it
    const revs = await db.listRevisions(a.id);
    const before = revs.find((r) => r.reason === 'before-restore')!;
    expect((await db.getRevision(before.id)).doc).toMatchObject({ name: 'v2' });
    // and the rollback itself can be undone the same way
    await lib.restoreRevision(a.id, before.id);
    expect((await db.getCharacter(a.id)).name).toBe('v2');
  });

  it('refuses a revision of another character', async () => {
    const a = await mk('A');
    const b = await mk('B');
    const rev = await db.saveRevision(b.id, 'x');
    await expect(lib.restoreRevision(a.id, rev)).rejects.toThrow(/another character/);
    expect((await db.getCharacter(a.id)).name).toBe('A');
  });
});

describe('export / import', () => {
  async function library() {
    const camp = await mkCampaign('Irouvia', custom({ crewTier: 3 }));
    const a = await mk('A', camp.id);
    const b = await mk('B');
    await db.archiveCharacter(b.id, true);
    await lib.addRuling(camp.id, { date: '2026-11-14', author: 'GM', quote: 'слово в слово', topic: 'x' });
    return { camp, a, b };
  }
  const apply = async (json: string, mode: 'copy' | 'replace' = 'copy') => lib.applyImport(await parseImport(json), mode);

  it('round-trips a whole library into an empty one: ids, campaign links, archive flag, rulings', async () => {
    const { camp, a, b } = await library();
    const { json, name } = await lib.buildFor('library');
    expect(name).toBe('blades-library.blades.json');
    const env = JSON.parse(json);
    expect(env).toMatchObject({ format: 'blades-export', kind: 'library', schemaVersion: 1 });
    expect(env.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.keys(env).filter((k) => /rulebook/i.test(k))).toEqual([]); // never exported

    localStorage.clear();
    const r = await apply(json);
    expect(r).toMatchObject({ added: 3, replaced: 0, copied: 0, rulings: 1 }); // 1 campaign + 2 sheets
    const rows = await db.listCharacters(true);
    expect(rows.find((x) => x.id === a.id)).toMatchObject({ campaignId: camp.id, archived: false });
    expect(rows.find((x) => x.id === b.id)).toMatchObject({ campaignId: null, archived: true });
    expect((await db.getCharacter(a.id))).toEqual(a);
    expect((await db.listRulings(camp.id))[0]).toMatchObject({ quote: 'слово в слово', author: 'GM', topic: 'x' });
  });

  it('importing the same file again changes nothing', async () => {
    await library();
    const { json } = await lib.buildFor('library');
    const r = await apply(json);
    expect(r).toMatchObject({ added: 0, replaced: 0, copied: 0, unchanged: 3, rulings: 0 });
    expect((await db.listCharacters(true)).length).toBe(2);
  });

  it('collision: "keep both" copies under a new UUID, "replace" overwrites and keeps a revision', async () => {
    const { a, camp } = await library();
    const { json } = await lib.buildFor('library');
    await db.saveCharacter({ ...a, name: 'A, changed later' });

    const prev = await lib.previewImport(await parseImport(json));
    expect(prev.characters.find((c) => c.id === a.id)!.status).toBe('conflict');

    await apply(json, 'copy');
    expect(await names()).toEqual(['A (копия)', 'A, changed later', 'B']);
    expect((await db.getCharacter(a.id)).name).toBe('A, changed later');
    const copy = (await db.listCharacters(true)).find((r) => r.name === 'A (копия)')!;
    expect(copy.id).not.toBe(a.id);
    expect(copy.campaignId).toBe(camp.id);

    const r = await apply(json, 'replace');
    expect(r.replaced).toBe(1);
    expect((await db.getCharacter(a.id)).name).toBe('A');
    const revs = await db.listRevisions(a.id);
    expect(revs.map((x) => x.reason)).toContain('before-import');
    expect((await db.getRevision(revs.find((x) => x.reason === 'before-import')!.id)).doc).toMatchObject({ name: 'A, changed later' });
  });

  it('a conflicting campaign kept as a copy takes its members and rulings along with new ids', async () => {
    const { camp, a } = await library();
    const { json } = await lib.buildFor('campaign', camp.id);
    expect(JSON.parse(json).characters.map((c: { doc: { id: string } }) => c.doc.id)).toEqual([a.id]); // members only
    await db.saveCampaign({ ...camp, rules: custom({ crewTier: 6 }) });
    await db.saveCharacter({ ...a, name: 'A2' });

    await apply(json, 'copy');
    const camps = await db.listCampaigns();
    expect(camps.map((c) => c.name).sort()).toEqual(['Irouvia', 'Irouvia (копия)']);
    const copyCamp = camps.find((c) => c.id !== camp.id)!;
    expect(copyCamp.rules.crewTier).toBe(3);
    expect(camps.find((c) => c.id === camp.id)!.rules.crewTier).toBe(6); // original untouched
    const member = (await db.listCharacters(true)).find((r) => r.name === 'A (копия)')!;
    expect(member.campaignId).toBe(copyCamp.id);
    const copied = await db.listRulings(copyCamp.id);
    expect(copied).toHaveLength(1);
    expect(copied[0].id).not.toBe((await db.listRulings(camp.id))[0].id);
  });

  it('a lone character export carries the campaign rules inside the sheet', async () => {
    const { camp, a } = await library();
    const { json, name } = await lib.buildFor('character', a.id);
    expect(name).toBe('A.blades.json');
    const env = JSON.parse(json);
    expect(env.kind).toBe('character');
    expect(env.campaigns).toEqual([]);
    expect(env.characters[0].campaignId).toBeNull();
    expect(env.characters[0].doc.rulesOverride).toMatchObject({ crewTier: camp.rules.crewTier, mode: 'custom' });
  });

  it('accepts a bare character document and a prototype save, rejects the rest', async () => {
    const a = newCharacter('leech', { name: 'Bare' });
    expect((await parseImport(JSON.stringify(a))).characters[0].doc.name).toBe('Bare');
    const proto = await parseImport(JSON.stringify({ name: 'Протот', alias: 'П', actions: { Ремесло: 2 }, rules: { mode: 'custom', money: false, stress: true, carry: true, band: false, presets: false, day: true, rest2: true, major: 'Д', minor: 'д', rate: 20, stressN: 9, talentXP: 16, stage: 'free', tier: 0 } }));
    expect(proto.characters[0].doc).toMatchObject({ name: 'Протот', alias: 'П' });
    await expect(parseImport('not json')).rejects.toThrow(/JSON/);
    await expect(parseImport('[]')).rejects.toThrow();
    const env = { format: 'blades-export', kind: 'library', schemaVersion: 99, appVersion: '9', exportedAt: '', characters: [], campaigns: [], rulings: [] };
    await expect(parseImport(JSON.stringify(env))).rejects.toThrow(/newer/);
    await expect(parseImport(JSON.stringify({ ...env, schemaVersion: 1, campaigns: [{ id: 'x' }] }))).rejects.toThrow();
  });

  it('importing over the open sheet reloads it in the editor', async () => {
    const { a } = await library();
    const { json } = await lib.buildFor('library');
    await lib.openCharacter(a.id);
    setField('name', 'edited, not saved yet');
    await apply(json, 'replace'); // pending edit is saved first, then replaced by the file's version
    expect(get().doc!.name).toBe('A');
    expect(get().saveState).toBe('saved');
  });
});

describe('backups', () => {
  it('restoring a backup brings the old data back and reopens a sheet', async () => {
    const a = await mk('A');
    const name = await db.backupNow();
    await db.deleteCharacter(a.id);
    await mk('Z');
    await lib.openCharacter((await db.listCharacters())[0].id);
    await lib.restoreFromBackup(name);
    expect(await names()).toEqual(['A']);
    expect(get().doc!.id).toBe(a.id);
  });

  it('parses backup file names into a date and a reason', () => {
    expect(parseBackupName('blades-20261122-153045-pre-restore-2.db')).toEqual({ at: new Date(2026, 10, 22, 15, 30, 45), reason: 'pre-restore' });
    expect(parseBackupName('blades-20261122-000001-daily.db').reason).toBe('daily');
    expect(parseBackupName('dev-1700000000000.json')).toMatchObject({ reason: 'manual' });
    expect(parseBackupName('junk').at).toBeNull();
  });
});

// Library operations: open / duplicate / archive / delete sheets, campaigns and their rulings, revision restore,
// backups, export / import. UI handlers call these; they all flush pending edits before touching the database
// and refresh the open sheet afterwards, so the editor never writes a stale document over a new one.
import * as db from '../api/db';
import { saveExport } from '../api/exchange';
import { buildExport, parseImport, withRules, type Bundle, type ExportChar, type ExportKind, type Parts } from '../engine/exchange';
import { loadCharacter } from '../engine/migrate';
import { BOOK_RULES, Character, type Campaign, type TableRules } from '../model';
import { t } from '../i18n';
import { boot } from './session';
import { useStore } from './store';
import { useUi } from './ui';

const uuid = () => crypto.randomUUID();
const flush = () => useStore.getState().flush('switch');
const openId = () => useStore.getState().doc?.id;
const copyName = (name: string) => `${name}${t('library.copySuffix')}`;

// ---- sheets

async function campaignRules(cid: string | null | undefined): Promise<TableRules | undefined> {
  return cid ? (await db.listCampaigns()).find((c) => c.id === cid)?.rules : undefined;
}

/** Makes `id` the open sheet (pending edits of the current one are saved first). `stay`: keep the current tab. */
export async function openCharacter(id: string, stay = false): Promise<void> {
  await flush();
  const row = (await db.listCharacters(true)).find((r) => r.id === id);
  const doc = await db.getCharacter(id);
  useStore.getState().open(doc, { rules: await campaignRules(row?.campaignId), campaignId: row?.campaignId ?? undefined });
  useUi.getState().set(stay ? { lastCharacter: id } : { lastCharacter: id, tab: 'sheet' });
}

/** After a change under the open sheet (restore, import, campaign delete): reload it, or boot another if it is gone. */
async function refreshOpen(): Promise<void> {
  const id = openId();
  if (!id) return;
  await openCharacter(id, true).catch(() => boot());
}

/** The open sheet's campaign link and campaign rules changed in the database: take them over (the doc itself is untouched). */
async function syncOpenCampaign(): Promise<void> {
  const id = openId();
  if (!id) return;
  const row = (await db.listCharacters(true)).find((r) => r.id === id);
  useStore.setState({ baseRules: (await campaignRules(row?.campaignId)) ?? BOOK_RULES, campaignId: row?.campaignId ?? undefined });
}

export async function duplicateCharacter(id: string): Promise<string> {
  if (id === openId()) await flush();
  const row = (await db.listCharacters(true)).find((r) => r.id === id);
  const doc = await db.getCharacter(id);
  const copy = Character.parse({ ...doc, id: uuid(), name: copyName(doc.name) });
  await db.saveCharacter(copy, row?.campaignId ?? undefined);
  return copy.id;
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  await db.archiveCharacter(id, archived);
}

/** The database makes a "pre-delete" backup. Deleting the open sheet opens another one (or a fresh sample). */
export async function removeCharacter(id: string): Promise<void> {
  const wasOpen = id === openId();
  if (wasOpen) await flush();
  await db.deleteCharacter(id);
  if (wasOpen) await boot();
}

// ---- campaigns

export async function createCampaign(name: string): Promise<string> {
  const id = uuid();
  await db.saveCampaign({ id, name, rules: BOOK_RULES });
  return id;
}
export const renameCampaign = (c: Campaign, name: string) => db.saveCampaign({ ...c, name });
export async function saveCampaignRules(c: Campaign, rules: TableRules): Promise<void> {
  await db.saveCampaign({ ...c, rules });
  await syncOpenCampaign();
}
export async function setMember(characterId: string, campaignId: string | null): Promise<void> {
  await db.setCharacterCampaign(characterId, campaignId);
  if (characterId === openId()) await syncOpenCampaign();
}
/** The member sheets get the campaign's rules in their own rulesOverride (done by the database), then it is deleted. */
export async function removeCampaign(id: string): Promise<void> {
  await flush();
  await db.deleteCampaign(id);
  await refreshOpen();
}

let ruleSaves: Promise<unknown> = Promise.resolve();
/** Settings, "campaign rules" target: edit the campaign the open sheet belongs to. */
export function setCampaignRule<K extends keyof TableRules>(key: K, value: TableRules[K]): void {
  const { campaignId: cid, baseRules } = useStore.getState();
  if (!cid) return;
  const rules = { ...baseRules, [key]: value };
  useStore.setState({ baseRules: rules });
  ruleSaves = ruleSaves
    .then(async () => {
      const c = (await db.listCampaigns()).find((x) => x.id === cid);
      if (c) await db.saveCampaign({ id: cid, name: c.name, rules });
    })
    .catch((e) => console.error('campaign rules not saved', e));
}
/** Drops the open sheet's own overrides so the campaign rules show through. */
export const clearRulesOverride = () => useStore.getState().edit((d) => void delete d.rulesOverride);

export async function addRuling(campaignId: string, r: { date: string; author: string; quote: string; topic?: string }): Promise<void> {
  await db.addRuling({ id: uuid(), campaignId, ...r, topic: r.topic || undefined });
}
/** Case-insensitive search over quote, author and topic. */
export const matchesRuling = (r: { quote: string; author: string; topic?: string }, q: string): boolean => {
  const s = q.trim().toLowerCase();
  return !s || [r.quote, r.author, r.topic ?? ''].some((x) => x.toLowerCase().includes(s));
};

// ---- history

/** Saves a revision of the current state first, then puts the old version in place. */
export async function restoreRevision(characterId: string, revisionId: number): Promise<void> {
  const isOpen = characterId === openId();
  if (isOpen) await flush();
  const rev = await db.getRevision(revisionId);
  const doc = await loadCharacter(rev.doc); // an old snapshot may predate the current schema
  if (doc.id !== characterId) throw new Error('revision belongs to another character');
  await db.saveRevision(characterId, 'before-restore');
  await db.saveCharacter(doc);
  if (isOpen) await refreshOpen();
}

// ---- backups

export async function restoreFromBackup(name: string): Promise<void> {
  await flush();
  await db.restoreBackup(name);
  await boot(); // everything may have changed: reload settings and the open sheet
}

// ---- export

const fileName = (s: string) => `${s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'blades'}.blades.json`;

async function entry(r: db.CharacterRow): Promise<ExportChar> {
  return { doc: await db.getCharacter(r.id), campaignId: r.campaignId, archived: r.archived, updatedAt: r.updatedAt };
}

/** Builds the export text and a file name; the save dialog is a separate step (exportTo) so this runs in tests. */
export async function buildFor(kind: ExportKind, id?: string): Promise<{ name: string; json: string }> {
  await flush();
  const rows = await db.listCharacters(true);
  const campaigns = await db.listCampaigns();
  const plain = (cs: typeof campaigns) => cs.map(({ id, name, rules }) => ({ id, name, rules }));
  if (kind === 'character') {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new db.DbError('NotFound', `character ${id}`);
    const e = await entry(row);
    // a lone sheet leaves its campaign: its rules travel inside the sheet
    const parts: Parts = { characters: [{ ...e, doc: withRules(e.doc, campaigns.find((c) => c.id === row.campaignId)?.rules), campaignId: null }], campaigns: [], rulings: [] };
    return { name: fileName(e.doc.name || 'character'), json: buildExport(kind, parts) };
  }
  const chosen = kind === 'campaign' ? campaigns.filter((c) => c.id === id) : campaigns;
  if (kind === 'campaign' && !chosen.length) throw new db.DbError('NotFound', `campaign ${id}`);
  const ids = new Set(chosen.map((c) => c.id));
  const members = rows.filter((r) => (kind === 'library' ? true : r.campaignId && ids.has(r.campaignId)));
  const rulings = (await Promise.all(chosen.map((c) => db.listRulings(c.id)))).flat();
  const parts: Parts = { characters: await Promise.all(members.map(entry)), campaigns: plain(chosen), rulings };
  return { name: fileName(kind === 'campaign' ? chosen[0].name : 'blades-library'), json: buildExport(kind, parts) };
}

/** Opens the save dialog. false = cancelled. */
export async function exportTo(kind: ExportKind, id?: string): Promise<boolean> {
  const { name, json } = await buildFor(kind, id);
  return saveExport(name, json);
}

// ---- import

export type Status = 'new' | 'same' | 'conflict';
export interface Preview {
  characters: Array<{ id: string; name: string; status: Status; incomingAt?: string; existingAt?: string }>;
  campaigns: Array<{ id: string; name: string; status: Status }>;
  rulings: number;
  warnings: string[];
}

/** What importing would do: new items, identical ones (skipped) and conflicts (same id, different content). */
export async function previewImport(b: Bundle): Promise<Preview> {
  const rows = new Map((await db.listCharacters(true)).map((r) => [r.id, r]));
  const camps = new Map((await db.listCampaigns()).map((c) => [c.id, c]));
  const characters: Preview['characters'] = [];
  for (const e of b.characters) {
    const row = rows.get(e.doc.id);
    const status: Status = !row ? 'new' : JSON.stringify(await db.getCharacter(e.doc.id)) === JSON.stringify(e.doc) ? 'same' : 'conflict';
    characters.push({ id: e.doc.id, name: e.doc.name, status, incomingAt: e.updatedAt, existingAt: row?.updatedAt });
  }
  const campaigns = b.campaigns.map((c) => {
    const ex = camps.get(c.id);
    const status: Status = !ex ? 'new' : ex.name === c.name && JSON.stringify(ex.rules) === JSON.stringify(c.rules) ? 'same' : 'conflict';
    return { id: c.id, name: c.name, status };
  });
  return { characters, campaigns, rulings: b.rulings.length, warnings: b.warnings };
}

export interface ImportResult {
  added: number;
  replaced: number;
  copied: number;
  unchanged: number;
  rulings: number;
}

/**
 * Writes the bundle. `conflicts`: "replace" overwrites the existing item (a revision of a sheet is kept first),
 * "copy" keeps both under a new UUID. A backup is made first.
 */
export async function applyImport(b: Bundle, conflicts: 'replace' | 'copy'): Promise<ImportResult> {
  await flush();
  const p = await previewImport(b);
  await db.backupNow();
  const res: ImportResult = { added: 0, replaced: 0, copied: 0, unchanged: 0, rulings: 0 };
  const count = (s: Status, copied: boolean) => (s === 'same' ? res.unchanged++ : s === 'new' ? res.added++ : copied ? res.copied++ : res.replaced++);

  const campMap = new Map<string, string>(); // incoming campaign id -> id in this library
  const knownCamps = new Set((await db.listCampaigns()).map((c) => c.id));
  for (const [i, c] of b.campaigns.entries()) {
    const s = p.campaigns[i].status;
    const copy = s === 'conflict' && conflicts === 'copy';
    const id = copy ? uuid() : c.id;
    campMap.set(c.id, id);
    if (s !== 'same') await db.saveCampaign({ ...c, id, name: copy ? copyName(c.name) : c.name });
    if (s !== 'same') knownCamps.add(id);
    count(s, copy);
  }

  for (const r of b.rulings) {
    const cid = campMap.get(r.campaignId) ?? (knownCamps.has(r.campaignId) ? r.campaignId : undefined);
    if (!cid) continue; // its campaign is nowhere: nothing to attach it to
    const fresh = cid !== r.campaignId; // a copied campaign gets copies of its rulings
    const have = fresh ? [] : await db.listRulings(cid);
    if (have.some((x) => x.id === r.id)) continue;
    await db.addRuling({ ...r, id: fresh ? uuid() : r.id, campaignId: cid });
    res.rulings++;
  }

  for (const [i, e] of b.characters.entries()) {
    const s = p.characters[i].status;
    if (s === 'same') {
      res.unchanged++;
      continue;
    }
    const copy = s === 'conflict' && conflicts === 'copy';
    if (s === 'conflict' && !copy) await db.saveRevision(e.doc.id, 'before-import');
    const doc = copy ? Character.parse({ ...e.doc, id: uuid(), name: copyName(e.doc.name) }) : e.doc;
    const cid = e.campaignId ? (campMap.get(e.campaignId) ?? (knownCamps.has(e.campaignId) ? e.campaignId : null)) : null;
    await db.saveCharacter(doc);
    await db.setCharacterCampaign(doc.id, cid);
    if (e.archived) await db.archiveCharacter(doc.id, true);
    count(s, copy);
  }
  await refreshOpen();
  return res;
}

export { parseImport };

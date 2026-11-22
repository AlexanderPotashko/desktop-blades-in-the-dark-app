// The only place that calls `invoke`. Thin typed wrappers over the Rust commands in src-tauri/src/db/commands.rs.
// Errors from Rust arrive as `{ kind, message }`; every call here rejects with a DbError.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { Campaign as CampaignSchema, Character, Ruling as RulingSchema } from '../model';
import type { Campaign, Ruling, TableRules } from '../model';

export type DbErrorKind = 'TooNew' | 'NotFound' | 'Invalid' | 'Io' | 'Db' | 'Unavailable';
export class DbError extends Error {
  constructor(
    public kind: DbErrorKind | 'Unknown',
    message: string,
  ) {
    super(message);
    this.name = 'DbError';
  }
}
function toDbError(e: unknown): DbError {
  if (e instanceof DbError) return e;
  if (typeof e === 'object' && e !== null && 'kind' in e && 'message' in e) {
    const { kind, message } = e as { kind: DbErrorKind; message: string };
    return new DbError(kind, String(message));
  }
  return new DbError('Unknown', e instanceof Error ? e.message : String(e));
}
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (e) {
    throw toDbError(e);
  }
}

export interface CharacterRow {
  id: string;
  name: string | null;
  playbook: string | null;
  campaignId: string | null;
  archived: boolean;
  updatedAt: string;
}
export interface RevisionRow {
  id: number;
  createdAt: string;
  reason: string;
}
/** `doc` is NOT validated: an old snapshot may predate the current schemaVersion. Migrate before using it. */
export interface Revision extends RevisionRow {
  characterId: string;
  doc: unknown;
}
export interface CampaignRow {
  id: string;
  name: string;
  rules: TableRules;
  updatedAt: string;
}
/** `name` is a bare file name in the backups folder; it is what restoreBackup takes. */
export interface BackupInfo {
  name: string;
  size: number;
}

// characters
export const listCharacters = (includeArchived = false) =>
  invoke<CharacterRow[]>('list_characters', { includeArchived });

export async function getCharacter(id: string): Promise<Character> {
  return Character.parse(JSON.parse(await invoke<string>('get_character', { id })));
}

/** Upsert by `doc.id`. `campaignId` undefined keeps the current link; use setCharacterCampaign to change it. */
export const saveCharacter = (doc: Character, campaignId?: string) =>
  invoke<string>('save_character', { docJson: JSON.stringify(doc), campaignId });

export const setCharacterCampaign = (id: string, campaignId: string | null) =>
  invoke<void>('set_character_campaign', { id, campaignId });
export const archiveCharacter = (id: string, archived: boolean) => invoke<void>('archive_character', { id, archived });
/** Makes a "pre-delete" backup first. */
export const deleteCharacter = (id: string) => invoke<void>('delete_character', { id });

// revisions
export const saveRevision = (characterId: string, reason: string) =>
  invoke<number>('save_revision', { characterId, reason });
export const listRevisions = (characterId: string) => invoke<RevisionRow[]>('list_revisions', { characterId });

export async function getRevision(id: number): Promise<Revision> {
  const r = await invoke<Omit<Revision, 'doc'> & { doc: string }>('get_revision', { id });
  return { ...r, doc: JSON.parse(r.doc) };
}

// campaigns
export async function listCampaigns(): Promise<CampaignRow[]> {
  const rows = await invoke<Array<CampaignRow>>('list_campaigns');
  return rows.map((r) => ({ ...CampaignSchema.parse(r), updatedAt: r.updatedAt }));
}
export const saveCampaign = (c: Campaign) =>
  invoke<string>('save_campaign', { json: JSON.stringify(CampaignSchema.parse(c)) });
/** Copies the rules into each member sheet's rulesOverride in one transaction, then deletes. */
export const deleteCampaign = (id: string) => invoke<void>('delete_campaign', { id });

// rulings
export const addRuling = (r: Ruling) => invoke<string>('add_ruling', { json: JSON.stringify(RulingSchema.parse(r)) });
/** Rust sends `topic: null` for no topic; normalized to absent before parsing. */
export async function listRulings(campaignId: string): Promise<Ruling[]> {
  const rows = await invoke<Array<Record<string, unknown>>>('list_rulings', { campaignId });
  return rows.map((r) => RulingSchema.parse({ ...r, topic: r.topic ?? undefined }));
}

// settings (values are JSON)
export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const v = await invoke<string | null>('get_setting', { key });
  return v === null ? undefined : (JSON.parse(v) as T);
}
export function setSetting(key: string, value: unknown): Promise<void> {
  if (value === undefined) return Promise.reject(new DbError('Invalid', `setting ${key}: undefined is not JSON`));
  return invoke<void>('set_setting', { key, valueJson: JSON.stringify(value) });
}

// backups
/** Returns the new backup's file name. */
export const backupNow = () => invoke<string>('backup_now');
export const listBackups = () => invoke<BackupInfo[]>('list_backups');
/** `name` comes from listBackups. Returns the name of the automatic "pre-restore" backup. Reload app state afterwards. */
export const restoreBackup = (name: string) => invoke<string>('restore_backup', { name });

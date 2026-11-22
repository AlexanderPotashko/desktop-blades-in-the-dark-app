// The only place that calls `invoke`. Thin typed wrappers over the Rust commands in src-tauri/src/db/commands.rs.
// Errors from Rust arrive as plain message strings (rejected promise).
import { invoke } from '@tauri-apps/api/core';
import { Character } from '../model';
import type { Campaign, Ruling, TableRules } from '../model';

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
export interface BackupInfo {
  path: string;
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
export const listCampaigns = () => invoke<CampaignRow[]>('list_campaigns');
export const saveCampaign = (c: Campaign) => invoke<string>('save_campaign', { json: JSON.stringify(c) });
/** Copies the rules into each member sheet's rulesOverride in one transaction, then deletes. */
export const deleteCampaign = (id: string) => invoke<void>('delete_campaign', { id });

// rulings
export const addRuling = (r: Ruling) => invoke<string>('add_ruling', { json: JSON.stringify(r) });
export const listRulings = (campaignId: string) => invoke<Ruling[]>('list_rulings', { campaignId });

// settings (values are JSON)
export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const v = await invoke<string | null>('get_setting', { key });
  return v === null ? undefined : (JSON.parse(v) as T);
}
export const setSetting = (key: string, value: unknown) =>
  invoke<void>('set_setting', { key, valueJson: JSON.stringify(value) });

// backups
/** Returns the new backup's file path. */
export const backupNow = () => invoke<string>('backup_now');
export const listBackups = () => invoke<BackupInfo[]>('list_backups');
/** Returns the path of the automatic "pre-restore" backup. The app should reload its state afterwards. */
export const restoreBackup = (path: string) => invoke<string>('restore_backup', { path });

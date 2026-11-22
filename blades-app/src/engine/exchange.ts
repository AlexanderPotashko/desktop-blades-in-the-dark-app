// `.blades.json`: the file format for exchange (PLAN.md §6). One envelope for every kind (character / campaign / library):
// the lists are simply shorter. Rulebook data is NEVER part of it (copyright); the Rust side refuses it too.
import { z } from 'zod';
import pkg from '../../package.json';
import { Campaign, Character, Ruling, SCHEMA_VERSION, Uuid, type TableRules } from '../model';
import { importPrototype } from './importPrototype';
import { loadCharacter } from './migrate';

export const FORMAT = 'blades-export';
export type ExportKind = 'character' | 'campaign' | 'library';

/** `doc` stays raw in the envelope: it may be older than the current schema and is migrated on import. */
const Entry = z.object({
  doc: z.unknown(),
  campaignId: Uuid.nullable().optional(),
  archived: z.boolean().optional(),
  updatedAt: z.string().optional(),
});
const Envelope = z.object({
  format: z.literal(FORMAT),
  kind: z.enum(['character', 'campaign', 'library']),
  schemaVersion: z.int().min(1),
  appVersion: z.string(),
  exportedAt: z.string(),
  characters: z.array(Entry),
  campaigns: z.array(Campaign),
  rulings: z.array(Ruling),
});

export interface ExportChar {
  doc: Character;
  campaignId: string | null;
  archived: boolean;
  updatedAt: string;
}
export interface Parts {
  characters: ExportChar[];
  campaigns: Campaign[];
  rulings: Ruling[];
}

export function buildExport(kind: ExportKind, p: Parts): string {
  return JSON.stringify(
    { format: FORMAT, kind, schemaVersion: SCHEMA_VERSION, appVersion: pkg.version, exportedAt: new Date().toISOString(), ...p, characters: p.characters.map((c) => ({ ...c, doc: Character.parse(c.doc) })) },
    null,
    2,
  );
}

/** A lone sheet leaves its campaign: copy the campaign rules into the sheet so it looks the same elsewhere (what deleting a campaign does). */
export const withRules = (doc: Character, campaignRules?: TableRules): Character =>
  campaignRules ? { ...doc, rulesOverride: { ...campaignRules, ...doc.rulesOverride } } : doc;

export interface Bundle extends Omit<Parts, 'characters'> {
  characters: Array<Omit<ExportChar, 'updatedAt'> & { updatedAt?: string }>;
  warnings: string[];
}

/** `blades-20261122-153045-pre-restore-2.db` -> local date + reason; the dev fallback's `dev-<ms>.json` is "manual". */
export function parseBackupName(name: string): { at: Date | null; reason: string } {
  const m = /^blades-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(.+?)(?:-\d+)?\.db$/.exec(name);
  if (m) return { at: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), reason: m[7] };
  const d = /^dev-(\d+)\.json$/.exec(name);
  return d ? { at: new Date(+d[1]), reason: 'manual' } : { at: null, reason: '' };
}

const isObj =(v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Reads a file's text: an own export, a lone character document, or a charsheet.html (prototype) JSON.
 * Throws an Error with a readable message; nothing is written here.
 */
export async function parseImport(text: string): Promise<Bundle> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not a JSON file');
  }
  if (!isObj(raw)) throw new Error('unrecognized file');
  if (raw.format === FORMAT) {
    const env = Envelope.parse(raw);
    if (env.schemaVersion > SCHEMA_VERSION) throw new Error(`file schemaVersion ${env.schemaVersion} is newer than this app supports (${SCHEMA_VERSION})`);
    const characters = [];
    for (const e of env.characters) {
      characters.push({ doc: await loadCharacter(e.doc), campaignId: e.campaignId ?? null, archived: e.archived ?? false, updatedAt: e.updatedAt });
    }
    return { characters, campaigns: env.campaigns, rulings: env.rulings, warnings: [] };
  }
  if (typeof raw.schemaVersion === 'number' && 'playbookId' in raw) {
    return { characters: [{ doc: await loadCharacter(raw), campaignId: null, archived: false }], campaigns: [], rulings: [], warnings: [] };
  }
  const r = importPrototype(raw); // throws when it is not a prototype save either
  const doc = Character.parse({ ...r.character, rulesOverride: r.rules });
  return { characters: [{ doc, campaignId: null, archived: false }], campaigns: [], rulings: [], warnings: r.warnings };
}

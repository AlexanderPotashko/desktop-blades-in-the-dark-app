import { Character, SCHEMA_VERSION } from '../model';

type Doc = Record<string, unknown>;
/** Turns a vN document into vN+1 (without touching schemaVersion; the runner sets it). */
export type Migration = (doc: Doc) => Doc;
/** Called with the untouched document before any migration runs; may be async (DB revision). */
export type BackupHook = (doc: unknown, fromVersion: number) => void | Promise<void>;

/** Key N migrates vN -> vN+1. Empty while only v1 exists. */
export const MIGRATIONS: Record<number, Migration> = {};

/** Runs the chain up to `target`; returns raw JSON (not validated). The input is never mutated. */
export async function migrate(raw: unknown, backup?: BackupHook, chain = MIGRATIONS, target = SCHEMA_VERSION): Promise<Doc> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('character document must be an object');
  const from = (raw as Doc).schemaVersion;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1)
    throw new Error('document has no schemaVersion (a prototype save? use importPrototype)');
  if (from > target) throw new Error(`document schemaVersion ${from} is newer than this app supports (${target})`);
  let doc = structuredClone(raw) as Doc;
  if (from === target) return doc;
  for (let n = from; n < target; n++) if (!chain[n]) throw new Error(`no migration from v${n}`);
  await backup?.(raw, from);
  for (let n = from; n < target; n++) doc = { ...chain[n](doc), schemaVersion: n + 1 };
  return doc;
}

/** Read path: migrate to the current version, then validate. */
export const loadCharacter = async (raw: unknown, backup?: BackupHook): Promise<Character> =>
  Character.parse(await migrate(raw, backup));

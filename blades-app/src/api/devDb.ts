// Dev/test fallback for plain browsers and jsdom: emulates the Rust commands of src-tauri/src/db/commands.rs
// over one JSON blob (localStorage when available, else memory). Same command names and payload shapes,
// so every wrapper in db.ts (parsing, errors) runs unchanged. Not a database: no migrations, one tab at a time.
// ponytail: whole blob rewritten on each write; fine for a handful of sheets, never ships to Tauri.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Db {
  characters: Record<string, { doc: string; campaignId: string | null; archived: boolean; updatedAt: string }>;
  revisions: Array<{ id: number; characterId: string; createdAt: string; reason: string; doc: string }>;
  campaigns: Record<string, { id: string; name: string; rules: unknown; updatedAt: string }>;
  rulings: Json[];
  settings: Record<string, string>;
  backups: Array<{ name: string; data: string }>;
}
const KEY = 'blades-dev-db';
const empty = (): Db => ({ characters: {}, revisions: [], campaigns: {}, rulings: [], settings: {}, backups: [] });

let mem: Db | undefined; // used only when localStorage is missing or full
function load(): Db {
  if (mem) return mem;
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Db) : empty();
  } catch {
    return (mem = empty());
  }
}
function save(db: Db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    mem = undefined;
  } catch {
    mem = db;
  }
}
const fail = (kind: string, message: string) => Promise.reject({ kind, message });
const now = () => new Date().toISOString();

export async function devInvoke<T>(cmd: string, a: Json = {}): Promise<T> {
  const db = load();
  const out = (v: unknown, write = false) => {
    if (write) save(db);
    return Promise.resolve(v as T);
  };
  switch (cmd) {
    case 'list_characters':
      return out(
        Object.entries(db.characters)
          .filter(([, c]) => a.includeArchived || !c.archived)
          .map(([id, c]) => {
            const d = JSON.parse(c.doc);
            return { id, name: d.name ?? null, playbook: d.playbookId ?? null, campaignId: c.campaignId, archived: c.archived, updatedAt: c.updatedAt };
          })
          .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)),
      );
    case 'get_character':
      return db.characters[a.id] ? out(db.characters[a.id].doc) : fail('NotFound', `character ${a.id}`);
    case 'save_character': {
      const d = JSON.parse(a.docJson);
      const prev = db.characters[d.id];
      db.characters[d.id] = { doc: a.docJson, campaignId: a.campaignId ?? prev?.campaignId ?? null, archived: prev?.archived ?? false, updatedAt: now() };
      return out(d.id, true);
    }
    case 'set_character_campaign':
      if (!db.characters[a.id]) return fail('NotFound', `character ${a.id}`);
      db.characters[a.id].campaignId = a.campaignId;
      return out(undefined, true);
    case 'archive_character':
      if (!db.characters[a.id]) return fail('NotFound', `character ${a.id}`);
      db.characters[a.id].archived = a.archived;
      return out(undefined, true);
    case 'delete_character':
      delete db.characters[a.id];
      return out(undefined, true);
    case 'save_revision': {
      const c = db.characters[a.characterId];
      if (!c) return fail('NotFound', `character ${a.characterId}`);
      const id = (db.revisions.at(-1)?.id ?? 0) + 1;
      db.revisions.push({ id, characterId: a.characterId, createdAt: now(), reason: a.reason, doc: c.doc });
      const mine = db.revisions.filter((r) => r.characterId === a.characterId).slice(-50);
      db.revisions = db.revisions.filter((r) => r.characterId !== a.characterId).concat(mine);
      return out(id, true);
    }
    case 'list_revisions':
      return out(db.revisions.filter((r) => r.characterId === a.characterId).map(({ id, createdAt, reason }) => ({ id, createdAt, reason })).reverse());
    case 'get_revision': {
      const r = db.revisions.find((x) => x.id === a.id);
      return r ? out(r) : fail('NotFound', `revision ${a.id}`);
    }
    case 'list_campaigns':
      return out(Object.values(db.campaigns));
    case 'save_campaign': {
      const c = JSON.parse(a.json);
      db.campaigns[c.id] = { ...c, updatedAt: now() };
      return out(c.id, true);
    }
    case 'delete_campaign':
      delete db.campaigns[a.id];
      return out(undefined, true);
    case 'add_ruling': {
      const r = JSON.parse(a.json);
      db.rulings.push(r);
      return out(r.id, true);
    }
    case 'list_rulings':
      return out(db.rulings.filter((r) => r.campaignId === a.campaignId).map((r) => ({ ...r, topic: r.topic ?? null })));
    case 'get_setting':
      return out(db.settings[a.key] ?? null);
    case 'set_setting':
      db.settings[a.key] = a.valueJson;
      return out(undefined, true);
    case 'backup_now': {
      const name = `dev-${Date.now()}.json`;
      db.backups.push({ name, data: JSON.stringify({ ...db, backups: [] }) });
      return out(name, true);
    }
    case 'list_backups':
      return out(db.backups.map((b) => ({ name: b.name, size: b.data.length })));
    case 'restore_backup': {
      const b = db.backups.find((x) => x.name === a.name);
      if (!b) return fail('NotFound', `backup ${a.name}`);
      save({ ...(JSON.parse(b.data) as Db), backups: db.backups });
      return out(`pre-restore-${Date.now()}.json`);
    }
    default:
      return fail('Unavailable', `${cmd}: not available outside Tauri`);
  }
}

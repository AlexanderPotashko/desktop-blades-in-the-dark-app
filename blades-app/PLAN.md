# Blades App — analysis and development plan

A character-sheet app for *Blades in the Dark* (Russian edition by Studio 101 as the primary rulebook): **all playbooks**, creation by the rulebook, "By the book" and "House rules" modes, a searchable rulebook, import/export.

**Decision (2026-11-15): desktop offline app first — macOS (primary, the player uses a MacBook) and Windows.** Tablet next, then phone. **No web version.** A server is an optional late addition.
**Player's answers (2026-11-15):** for our own group only (not distributed publicly); platforms are Windows and macOS, Mac matters more; version 1.0 ships **all 7 playbooks** and **profiles** (several characters, quick switching).

Status: **analysis and plan only**, no code yet. Rev. 2 (2026-11-15): SQLite storage instead of JSON files, data layer in Rust, FTS5 search.

---

## 1. What exists (analysis)

### 1.1. Prototype `../charsheet.html`
A single HTML file: vanilla JS, string-template rendering, data in `localStorage` (key `bitd-leech`), rulebook text in `../rulebook.js`. Built for one Leech character. Covered by a jsdom smoke test (~100 checks) and headless Edge screenshots.

**Features to keep** (they grew out of real play):

| Area | What it does |
|---|---|
| Header | name, alias, day counter (optional), tabs, ⚙ settings, ? tips, export/import (with confirmation and backup), print, reset |
| ⚙ Settings | **"By the book" / "House rules"** mode; in house rules, official mechanics are switched off with checkboxes: money (coin + stash ↔ custom currency with exchange rate), stress (9 +1 ↔ custom count), bandolier (book list ↔ own items), counter presets (book ↔ own), day counter, custom downtime (+1 healing −1 stress / −2 stress); skill stage (creation 7/2 · in play 3 · Mastery 4 · no limits); crew tier; tips; restore backup |
| Tips | rules help pops up on hover over headings and buttons; toggled with the ? button |
| Actions | 12 actions rated 0–4, attributes computed automatically, limits checked by stage, XP tracks 6/6/6 and 8 |
| Special abilities | only chosen ones are shown; own playbook, veteran abilities from any other playbook, **custom ability** (name + text) |
| Stress and trauma | 9 / 10 / custom; 8 traumas + **custom traumas** |
| Harm | 3 levels, 4-segment healing clock, **armor from any item** that has armor boxes |
| Counters | generic (name, ±, max, reset on day/downtime/score/manual), drag to reorder, presets per ability; rest buttons |
| Gear | money (book or custom currency); load; book and custom items: total / carried / load; groups with nested rows and quantities; bandolier slots; **item dialog**: note + properties (type, quality I–VI, fine, uses with a −1 button, armor boxes, "gives", drawbacks) |
| Workshop | projects: progress x/y, quantity, contents, properties, move to gear and back |
| Notes | cards: list on the left, editor on the right |
| Background | heritage / background / vice from the book or custom; playbook friends + **custom contacts** |
| Rulebook | full book text by page, **search** with highlighting and hit count, table of contents, paging |

**Technical debt not to carry over:**
- monolith, Leech data hard-coded;
- `innerHTML` rendering, state patched piecemeal;
- **no schema version**, migrations scattered as flags (`mig1`, `presetDone`, `S.tc` move, `OUR_RULES` for old saves);
- custom item ids are **array indexes** (`u0`, `p1`) and shift on delete;
- fields added ad hoc (`bqty`, `btake`, `loadOv`, `nameOv`, `subOv`, `bandQ`, `armorOv`, `itemProps`…) — the data model is redesigned from scratch;
- storage lives in one browser only.

### 1.2. Rulebook (`../rulebook.txt`, PDF page = book page + 5 in the Russian edition)

| What | Book pages | What to extract |
|---|---|---|
| Character creation | 66–72 | steps, limits (7 dots, max 2), heritages, backgrounds, vices, names/aliases/looks |
| Actions | 73–75, 196–219 | 12 actions, attribute groups, descriptions |
| 7 playbooks | 77–103 | starting actions, special abilities, XP trigger, friends/rivals, special items, gather-information questions, starting builds |
| Standard items | 104–105 | list and load |
| Crews (6 types) | 107–141 | upgrades, abilities, reputation, lair, turf, contacts |
| Special playbooks | 259–263 | Ghost, Hull, Vampire |
| Crafting | 269–274 | standard creations, drawbacks, quality |
| Advanced abilities | 281–283 | Forgotten Gods, Iruvian fencing, Echo society, demonic bond |

### 1.3. Lessons from real play — why flexibility matters
A real campaign with house rules: start with 14 action dots and ratings up to 4; foreign abilities cost x2; a custom currency with an exchange rate; scarcity, some gear does not exist in the world; custom downtime; custom readings of abilities; a log of GM rulings.

**Conclusion:** book rules are **defaults**. "By the book" turns them all on; "House rules" lets you switch any of them off and substitute your own.

### 1.4. Copyright (important)
The Russian text belongs to Studio 101, the original to One Seven Design (SRD under CC BY 3.0). PDFs found online must not be redistributed.
- **For personal use**, anything goes.
- If the app is ever **distributed**: ship names, numbers and short paraphrases only. **The full rulebook text is never shipped**: the user imports their own PDF/text and the app builds the search index locally.

---

## 2. Requirements

**Functional**
1. All 7 playbooks + Ghost, Hull, Vampire; crew sheets later.
2. **Profiles** (character library): create, open, duplicate, archive, delete; quick switching between profiles (the last one opened is remembered); each profile has its campaign or its own rules.
3. **Creation wizard** by the rulebook (step by step, tips, limits) + a "joined a running game" mode without limits.
4. Every prototype feature (1.1) for any playbook.
5. **Campaigns**: characters and crew, "Table rules" ("By the book" / "House rules" with toggles), GM rulings log.
6. **Rulebook**: import your own PDF/text, full-text search with morphology (Russian «испытание» finds «испытания»), table of contents, bookmarks, "p. N" links from tips open the right page.
7. Import/export: character, campaign, whole library; **import from the prototype** (`bitd-leech` localStorage, exported JSON, `rulebook.js`); print to PDF.
8. **History and undo:** Ctrl+Z / Ctrl+Y within a session; "as it was yesterday" — roll a character back to an earlier revision.
9. **Languages:** a switch in ⚙ (defaults to the system language). Changes the UI and the names of book entities; custom items/abilities stay as written. Version 1.0: **Russian and English**; a new language = a folder of translations, no code changes. Next, by availability of official editions (terminology is taken from them): **wave 2** — Spanish (Nosolorol, 2019), Italian (Grumpy Bear Stuff + Pendragon, 2020), French (500 Nuances de Geek, revised 2023), German (System Matters); **wave 3** — Polish, Portuguese (Brazil), Korean, Japanese (active communities / translations, edition to be confirmed); others (Chinese, Dutch, Czech…) on request, fan translations exist.
10. **AI agent via MCP (code mode):** opt-in in ⚙. A local MCP server lets an agent (Claude Desktop, Claude Code, any MCP client) read and edit characters, notes and plans. Code mode: two tools — `sheet_api` (typed API description) and `sheet_execute` (agent-written JS against the sheet) — instead of dozens of small tools. Every agent write is one undoable step with a revision saved before it. Already working in the prototype (`tools/mcp/`).

**Non-functional**
- **Fully offline**, no accounts, no internet.
- Data in **one local SQLite database**; outward-facing files are plain: exports (`.blades.json`) and daily backups in `Documents/Blades`.
- Never lose data: transactions, autosave, schema versions, migrations with a backup before each, backup rotation.
- Multiple languages (item 9), dark theme, rules tips on hover.
- **macOS and Windows** from the first version, **one codebase — the platform is a simple switch**: one build command with `mac` / `win`; in the app, ⚙ "Platform: auto / Mac / Windows" (auto by default) affects only shortcuts (Cmd or Ctrl) and their labels. No platform-specific screens or code branches. Mac is tested first.
- Later: the same code on tablet and phone (a separate touch layout).

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** | small installer (~10 MB vs ~100 MB for Electron); **the same v2 builds iOS and Android** |
| Language | **TypeScript** + **Rust** for the data layer | types catch migration bugs; data and search in Rust are fast and share one transaction |
| UI | **React 19 + Vite** | predictable ecosystem for agents, fast builds |
| State | **Zustand + Immer** (Immer patches → undo/redo) | simple, no boilerplate; undo without an extra library |
| Schemas | **Zod 4** | types + validation of the character document and imports from one schema |
| **Database** | **SQLite** via **rusqlite** (`bundled` build: own SQLite with FTS5, online backup) | transactions, revision history, campaign relations, built-in full-text search; one file |
| DB access | **own Tauri commands** (~12: `list/get/save_character`, `save_revision`, `backup`, `rb_search`…), not SQL from the UI | the UI cannot run arbitrary SQL; all transaction and backup logic in one place |
| Rulebook search | **FTS5** + Snowball stemmer (`rust-stemmers` crate) | words are reduced to stems at import and at query time; `bm25` ranking, `highlight()` |
| PDF import | **pdf.js** in the app window → text cleanup (port of `tools/mkrulebook.py` to TS) → pages into the DB | works with any edition the user owns |
| Drag and drop | **dnd-kit** | mouse now, finger on tablet later |
| Tests | **Vitest** (engine, schemas), **cargo test** (DB: migrations, backup, search), **Playwright** via Tauri WebDriver (e2e, screenshots; supported on Windows) | replaces the prototype's jsdom tests and headless Edge |
| Styles | CSS variables (prototype tokens) + CSS Modules | keep the current look without heavy UI libraries |
| Languages | dictionaries `locales/<lang>.json` + own `t()` (~30 lines) with typed keys; plurals, numbers and dates via built-in `Intl.PluralRules` / `Intl.NumberFormat` / `Intl.DateTimeFormat` | TypeScript catches missing translations; Russian plural forms without a library. Switch to i18next if outside translators and their tooling are needed |
| AI agent (MCP) | **MCP server inside the app** (Rust, official `rmcp` SDK), Streamable HTTP on `127.0.0.1` with a per-install token; for clients that only speak stdio — a tiny sidecar `blades-mcp` that forwards stdio to the app. Code mode runs agent code in **QuickJS** (embedded via `rquickjs`): no file or network access, memory and time limits | the app owns the data, so the server lives there (no WebSocket bridge as in the prototype); QuickJS is a real sandbox, unlike `node:vm` |
| Installer | **macOS:** `.dmg`, universal build (Apple Silicon + Intel), ad-hoc signed, not notarized · **Windows:** NSIS, unsigned | own group only: no paid Apple ($99/yr) or Windows certificate needed |
| Build | the Mac build is made **on a Mac** (Tauri cannot build macOS from Windows): on the player's MacBook or a macOS GitHub Actions runner; Windows on a PC | both builds from one codebase; `npm run build:mac` / `npm run build:win` |
| Updates | manual: install the new `.dmg` / installer over the old one (database and backups are kept). Updater plugin later, if this gets tedious | simplest for a small group |

**Rejected, and why:**
- web/PWA — not needed by decision; Electron — heavier; IndexedDB — data hidden in the browser profile;
- **JSON files as primary storage** — no transactions, history or relations, search would need a separate index (MiniSearch) — replaced by SQLite;
- official `tauri-plugin-sql` — exposes SQL execution to the UI and has no online backup; own commands on rusqlite are a little more code but safer and easier to test;
- CRDT sync (Automerge, Yjs, cr-sqlite) — overkill: a sheet has one owner; cr-sqlite is reportedly still immature;
- Capacitor — Tauri 2 already does mobile.

---

## 4. Architecture

```
blades-app/
  content/              ← rulebook data (JSON by schema), separate from code, bundled into the build
    core/               ← language-independent: ids, numbers, load, links (ability → playbook, item → load)
      playbooks/*.json  ← 7 playbooks + ghost/hull/vampire
      crews/*.json      ← 6 crew types
      common.json       ← actions, items, traumas, heritages, backgrounds, vices, creations
    ru/ en/ …           ← texts keyed by the same ids: names, descriptions, tips.json (tips and page numbers of that edition)
  locales/ru.json en.json …  ← UI strings
  src/
    model/              ← Zod schemas, document migrations (schemaVersion), "Table rules"
    engine/             ← pure functions: attributes, stage limits, load, rest, armor, quality
    store/              ← Zustand: open character, Immer patches (undo), autosave
    api/                ← thin wrappers over Tauri commands (the only place that calls invoke)
    rulebook/           ← PDF import, text cleanup, page viewer, search
    ui/                 ← sheet tabs and components (as in the prototype)
    wizard/             ← creation wizard
  src-tauri/
    src/db/             ← connection, migrations (PRAGMA user_version), commands, backup, FTS5 + stemmer
    capabilities/       ← window permissions: own commands + file dialog only (least privilege)
```

**Key principles**
1. **Content separate from code.** A new playbook = a new JSON file. Book content is not stored in the DB — it is part of the build; the DB holds only user data.
2. **Rules are defaults.** `engine` reads the campaign's "Table rules". In "By the book" mode everything official is forced on.
3. **A character is a document.** The whole sheet is one JSON value (validated by Zod on read and write), not spread over dozens of tables: playbooks and house rules change, the DB schema does not. Lists and filters use generated columns (`name`, `playbook`) with indexes.
4. **Two schema versions, both migrated:** the DB via `PRAGMA user_version` (Rust), the document via `schemaVersion` (TS, a `vN → vN+1` chain). A backup before every migration.
5. **Stable ids** (UUID) for everything.
6. **Book and custom are equal.** Custom items, abilities, counters, contacts, traumas, heritages and creations work through **the same mechanics** as book ones.
7. **Help stays out of the way.** Tips on hover (the ? toggle), "p. N" links open the Rulebook tab.
8. **Least privilege.** The window can call only its own commands and the system Save/Open dialog; no general disk access (`fs`). Strict CSP, no remote content. Rulebook text is rendered as text, never as HTML.
9. **UI first, agent second.** Every feature is built in the UI first, so a person can do it by hand. The MCP agent (code mode) is a second path to the same operations, never the only one: the agent API exposes no action that the UI lacks, and its helpers mirror UI actions (create a note, add a floor, add a room…). A feature is not done until it works by hand.

**Save flow**
```
edit in UI → Immer produceWithPatches → (patch onto the undo stack) → new state
          → after 800 ms of quiet: save_character(doc) → UPDATE in a transaction (WAL)
          → every 10 minutes of edits, on close and before import: save_revision(snapshot)
```

---

## 5. Data model

### 5.1. SQLite tables

```sql
campaigns  (id TEXT PK, name, rules JSON, updated_at)
characters (id TEXT PK CHECK (id = doc->>'$.id'), campaign_id → campaigns, doc JSON, schema_version INT, archived INT, updated_at,
            name     TEXT GENERATED ALWAYS AS (doc->>'$.name'),
            playbook TEXT GENERATED ALWAYS AS (doc->>'$.playbookId'))   -- indexes on name, playbook, campaign_id
revisions  (id INTEGER PK, character_id → characters, created_at, reason, doc JSON)  -- "as it was yesterday"; keep the last 50 + one per day
rulings    (id TEXT PK, campaign_id, date, author, quote, topic)                     -- GM rulings log, verbatim
rulebooks  (id TEXT PK, title, imported_at)                                          -- PDF ↔ book page mapping is per page in rb_pages
rb_pages   (rulebook_id, pdf INT, book INT, text, PRIMARY KEY(rulebook_id, pdf))
rb_toc     (rulebook_id, ord INT, title, page INT, level INT)
rb_fts     USING fts5(stemmed, content='', ...)   -- word stems of a page; rowid ↔ rb_pages
bookmarks  (id TEXT PK, rulebook_id, page INT, title, created_at)
settings   (key TEXT PK, value JSON)                                                  -- backup folder, theme, last opened sheet
```

### 5.2. Character document (JSON in `characters.doc`)

```ts
TableRules{ mode:'book'|'custom',
            money:   { book:true } | { book:false, major, minor, rate },
            stress:  { book:true } | { book:false, boxes },
            bandolier:'book'|'own-items', presets:'book'|'book+own',
            dayCounter:boolean, downtime:'book'|'table',      // table: +1 healing −1 stress | −2 stress
            skillStage:'creation'|'play'|'mastery'|'free', crewTier:0..6,
            foreignTalentCost:1|2 }

Character { id, schemaVersion, playbookId, name, alias, look, day,        // campaign link: characters.campaign_id only
            heritage, background, vice, contacts: {id, bookId?, name?, rel:'up'|'down', note}[],  // playbook friends + custom
            actions: Record<actionId,0..4>, xp:{insight,prowess,resolve,playbook},
            talents: talentId[], customTalents: {id,name,text}[],
            stress, trauma: string[], customTraumas: {id,name,text}[],
            harm:{l3,l2:[,],l1:[,]}, healing:0..4, armorUsed: Record<itemId,n>,
            specialArmorUsed: Record<talentId,boolean>,       // checkboxes above counters, from any playbook's (or custom) special-armor talents; cleared by downtime
            money:{coins,stash}|{major,minor}, load:'light'|'normal'|'heavy',
            items: Item[], workshop: WorkItem[], counters: Counter[], cards: Card[],
            rulesOverride?: Partial<TableRules> }             // a sheet without a campaign keeps its own rules

Item      { id, bookId?, name, load, qty, carried, open,                 // book item iff bookId
            note, props: ItemProps, sub?: SubItem[], slots?: Slot[] }  // sub absent = book contents; slots = bandolier
ItemProps { type?:'standard'|'alchemical'|'arcane'|'spark-craft', quality?:'tier'|0..6, fine?:boolean,
            uses?:number, usesLeft?:number, armor?:number, gives?:string, flaws:string[] }
            // TODO: item counter (e.g. "Spirit Wardens attention" 4 boxes on potions / electroplasmic ammo, p. 87, 272), healing segments a creation adds (potion of vitality +4, p. 273)
SubItem   { id, name, qty? }
WorkItem  { id, name, done?, total?, qty, load, note, props: ItemProps, sub: SubItem[] }
Counter   { id, name, value, max?, reset:'day'|'downtime'|'score'|'manual', fromTalent? }
Card      { id, title, text }
```

**All document objects are strict:** an unknown key fails validation (the prototype importer routes unknown fields to the «Импорт: не перенесено» card first).

**Deleting a campaign** never falls back to book rules: before the row goes, the app copies the campaign's `rules` into `rulesOverride` of each of its sheets (in the same transaction), then `campaign_id` becomes NULL.

**Migrations:** the first document migration is **import of the prototype format** with all its fields and flags (`mig1`, `OUR_RULES`, index ids `u0`/`p1` → UUID, `itemProps`, `subOv`, `bandQ`…).

---

## 6. Storage, backups, exchange

| What | Where | How |
|---|---|---|
| **Database** `blades.db` | app data folder: Mac `~/Library/Application Support/Blades`, Windows `%APPDATA%\Blades` | WAL mode, every write in a transaction. **Not in Documents:** it is often synced by iCloud (Mac) or OneDrive (Windows 11), and syncing a live SQLite database (`-wal`/`-shm` files) can corrupt it |
| **Backups** | `Documents/Blades/backups/` | `VACUUM INTO` (a consistent snapshot of the live DB): daily on launch, before a migration, before an import, before an update; keep the last 14. Cloud sync does not hurt these, they are never open |
| **Export** | wherever the user chooses | `.blades.json`: a character or a campaign (document + `schemaVersion` + app version); whole library = one `.blades.json` with all sheets and the rulings log. The rulebook is never exported (copyright) |
| **Import** | Open dialog | Zod validation → migrate to the current version → backup → write. Supported: own exports, prototype JSON, prototype `rulebook.js`, rulebook PDF |
| **Restore** | File → Restore from backup | pick a backup by date; the current state is backed up first |

**Sync between devices (later, phase 13):**
1. simple path — export/import a file (cloud, messenger, USB stick). When importing a sheet that already exists, show "newer/older" and offer to pick one or keep both;
2. full path — a server (PocketBase) for a "GM table". A sheet has one owner, so last-write-wins + a revision number for conflict detection + the `revisions` table for rollback is enough. No CRDT.

---

## 7. Phases and subagent models

Models: **Opus 5.5** (`claude-opus-5-5`) — architecture, complex logic, anything where a bug = data loss, reviews; **Sonnet 5.5** (`claude-sonnet-5-5`) — main implementation; **Haiku 5.5** (`claude-haiku-5-5`) — mechanical checklist tasks.

| # | Phase | What it does | Model | Why | Done when |
|---|---|---|---|---|---|
| 0 | Analysis and plan | this document (rev. 2: SQLite) | Opus 5.5 | ✅ done | plan approved |
| 1 | Schemas | Zod schemas for content, character document, campaign, "Table rules"; SQLite DDL | **Opus 5.5** | defines everything after it | schemas cover 10 playbooks and 6 crews; DDL passes review |
| 2 | Rulebook extraction | sections from 1.2 → `content/*.json`, tips → `tips.json` (paraphrased) | **Sonnet 5.5** | long structured transfer that needs understanding | all files pass the schema |
| 2a | Data check | verify every number and name against `rulebook.txt` | **Haiku 5.5** | checklist work | 0 mismatches or all explained |
| 3 | Engine | `engine/`: attributes, stage limits, load, rest, armor, quality, rule modes; document migrations + prototype import | **Opus 5.5** | subtle logic, a bug = data loss | unit tests green; the reference character save and browser storage import losslessly |
| 4 | Shell and data layer | Tauri 2 + React + Vite + TS, window, menu, theme, tabs, capabilities, CSP; **Rust: rusqlite, DB migrations, commands, transactions, `VACUUM INTO`, backup rotation**; **trial Android build** (empty window + DB) | data layer design — **Opus 5.5**, implementation — **Sonnet 5.5** | standard infrastructure, but the data layer is the main data-loss risk; an early Android build de-risks the stack | `.dmg` on Mac and NSIS on Windows install and run offline; `cargo test`: migrations, backup and restore; the Android build opens |
| 5 | Sheet components | everything from 1.1 as shared components for any playbook, including ⚙ settings and tips; autosave, Ctrl+Z/Ctrl+Y on Immer patches | **Sonnet 5.5** | large UI with a reference | parity with the prototype per the 1.1 checklist |
| 5a | Unit tests | tests for the prototype smoke-test scenarios | **Haiku 5.5** | templated tests | all prototype scenarios covered |
| 6 | Rulebook | PDF (pdf.js) and `rulebook.js` import, text cleanup, TOC, FTS5 + stemmer, ranked search with highlighting, bookmarks, "p. N" links | **Sonnet 5.5** (index and cleanup design reviewed by **Opus**) | known tools; search quality matters | inflected forms are found; whole-book search < 50 ms; links from tips open the page |
| 7 | Creation wizard | step by step by the book + "joined a running game" | **Sonnet 5.5** (limits reviewed by **Opus**) | UI flow; rules checked by a stronger model | any playbook can be created by the book and without limits |
| 8 | Library and campaigns | characters, campaigns, "Table rules", rulings log, revision history ("as it was yesterday"), export/import, restore from backup, print to PDF | **Sonnet 5.5** | CRUD and forms | all operations + prototype import |
| 9 | E2E and visual checks | Playwright: game scenarios, screenshots at different window sizes; a "crash mid-write" scenario. There is no Tauri WebDriver on macOS → on Mac the same scenarios run in Safari against the built frontend (same WebKit engine) + a manual checklist on the `.dmg` | **Sonnet 5.5** | screenshots need judgment | all scenarios green on both platforms, no data loss |
| — | **Desktop version 1.0** (macOS + Windows, all 7 playbooks, profiles, ru + en) | — | — | — | phases 1–9 + L |
| 10 | Crew sheets and special playbooks | crews, Ghost/Hull/Vampire, advanced abilities | **Sonnet 5.5** | same mechanisms, new content | available in creation and campaigns |
| 11 | Tablet | touch layout (large targets, finger drag), Tauri build for iPad/Android | **Sonnet 5.5** (layout reviewed by **Opus**) | new UI on the same engine | works offline on a tablet |
| 12 | Phone | separate compact layout (one column, bottom tabs) | **Sonnet 5.5** | same | works offline on a phone |
| 13 | Sync (optional) | import with "newer/older" choice → a PocketBase server with revisions if needed | **Opus 5.5** (conflicts) → **Sonnet 5.5** | main data-loss risk | two devices edit one character without loss |
| 14 | Documentation | help, README, "Table rules" guide | **Haiku 5.5** | writing from finished work | help covers every screen |
| L | Languages (v1.0: ru + en) | `t()` and dictionaries from phase 5 on (no literal UI strings in components); `content/en/` from the English SRD (CC BY 3.0, may ship with attribution); dictionary completeness checked in tests; search stemmer follows the rulebook's language | dictionaries and `content/en` — **Sonnet 5.5**, completeness check — **Haiku 5.5** | translation needs game terminology; the check is mechanical | switching ru ↔ en changes the whole UI and book names, characters stay intact |
| A | AI agent (MCP, code mode) | MCP server in the app, token pairing screen in ⚙, QuickJS sandbox, typed API generated from the Zod schemas (`sheet_api`), `sheet_execute` as one undoable transaction + revision, activity log («что агент поменял») | design and sandbox — **Opus 5.5**, implementation — **Sonnet 5.5** | security boundary and data writes | an agent edits a character and a plan through Claude Desktop and Claude Code; the change can be undone; agent code cannot touch files or network |
| R | **Review after each phase** | code, data, conformance to the plan | **Opus 5.5** | catches architectural mistakes early | findings closed |

**Order and parallelism**
```
1 → 2 → 2a ┐
1 → 3 ─────┼→ 5 → 7 → 8 → 9 ══ v1.0 desktop ══ 10 → 11 → 12 → 13 → 14
1 → 4 ─────┘   ├→ 5a
               ├→ 6 (rulebook, in parallel with 7–8)
               └→ A (AI agent, after 8: needs revisions and undo)
```

---

## 8. Risks and open questions

| Risk / question | Mitigation |
|---|---|
| Rulebook copyright | no rulebook text in the build; users import their own; the rulebook is never exported |
| DB corruption by cloud sync | the DB lives in the app data folder; Documents holds only closed backups and exports |
| Data loss | transactions + WAL, backup before migrations and imports, 14-copy rotation, `revisions`, migration tests on a real character save, "crash mid-write" e2e |
| PDF text quality (hyphenation, line breaks) | cleanup as in `tools/mkrulebook.py`, manual page editing |
| Russian morphology in search | Snowball stemmer at import and query time; fallback: prefix search (`word*`) |
| Tauri mobile is younger than desktop | trial Android build already in phase 4; engine and data are shared, only the layout changes |
| An AI agent breaks or wipes a sheet | opt-in, localhost only, token; every write is one undoable step with a revision; QuickJS sandbox without file/network access; Zod validation of the result before saving |
| Every table has its own house rules | campaign "Table rules" + custom entities on par with book ones |
| Install warnings without paid signing | **Windows:** SmartScreen → "More info → Run anyway". **macOS:** if the `.dmg` came from the internet/Telegram — System Settings → Privacy & Security → "Open Anyway" (or `xattr -dr com.apple.quarantine /Applications/Blades.app`); a build made on your own Mac opens directly. Instructions in the group README |
| Different web engines: WebKit (Mac) and WebView2/Chromium (Windows) | layout checked on both; no experimental CSS; Mac first |
| Documents is synced by iCloud on Mac and OneDrive on Windows | DB in `~/Library/Application Support/Blades` and `%APPDATA%\Blades`; only closed copies in Documents |

**Decided (2026-11-15):** own group only · macOS (primary) + Windows · all 7 playbooks and profiles in version 1.0.

**Open question:** will a "GM table" (the GM sees every player's sheet live) be needed later? If yes, phase 13 needs a server. No need to decide before phase 13.

---

## 9. Sources (best practices, November 2026)

- SQLite in Tauri 2, official plugin vs rusqlite: [tauri-plugin-sql](https://docs.rs/crate/tauri-plugin-sql/2.4.0), [SQLite in a Tauri v2 app (rusqlite)](https://dev.to/hiyoyok/sqlite-in-a-tauri-v2-app-simple-reliable-zero-regrets-391h), [tauri-plugin-rusqlite2](https://rust-digger.code-maven.com/crates/tauri-plugin-rusqlite2)
- Tauri 2 permissions and scopes: [Scopes](https://v2.tauri.app/security/scope/), [Plugin permissions](https://v2.tauri.app/ja/learn/security/using-plugin-permissions/)
- Documents in SQLite via JSON and generated columns: [antonz.org](https://antonz.org/sqlite-generated-columns/), [dbpro.app](https://www.dbpro.app/blog/sqlite-json-virtual-columns-indexing)
- Corruption and backups: [How to corrupt SQLite](https://sqlite.org/howtocorrupt.html), [backing up a WAL database](https://oneuptime.com/blog/post/2026-09-08-back-up-wal-mode-sqlite-safely/view), [WAL and cloud folders](https://sqlitetoolsforrootsmagic.com/forum/topic/database-backup-with-wal/?part=2)
- Russian morphology in FTS5: [Snowball Russian](https://snowballstem.org/algorithms/russian/stemmer.html), [fts5-snowball](https://relatedrepos.com/gh/abiliojr/fts5-snowball), [SQLite Forum](https://sqlite.org/forum/info/269d3acf50cab937)
- Undo/redo with Immer patches: [egghead](https://egghead.io/lessons/react-use-immer-patches-to-build-redo-functionality), [Travels](https://unadlib.github.io/2025/10/05/rethinking-undo-redo-why-we-need-travels/)
- Local-first and sync: [2026 engines overview](https://www.youngju.dev/blog/culture/2026-05-15-crdt-local-first-engines-2026-yjs-automerge-loro-replicache-liveblocks-deep-dive.en), [CRDTs for offline-first mobile](https://dev.to/software_mvp-factory/crdts-for-offline-first-mobile-sync-1mja)
- Tauri 2 on mobile: [Tauri 2.0 RC](https://v2.tauri.app/blog/tauri-2-0-0-release-candidate/), [experience in 2026](https://blog.codercops.com/blog/tauri-2-desktop-mobile-apps-rust-web-2026)
- MCP code mode: [Anthropic: code execution with MCP](https://www.anthropic.com/news/code-execution-with-mcp), [Cloudflare Code Mode](https://developers.cloudflare.com/agents/tools/codemode/index.md), [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server.html)
- Installer and updates: [Updater](https://v2.tauri.app/plugin/updater/), [auto-updates on Windows](https://voidcraft-blog.pages.dev/blog/tauri-auto-updates-on-windows-a-practical-guide)
- Translations of the game: [publisher's 2018 translation list](https://bladesinthedark.backerkit.com/hosted_preorders/project_updates?page=3), [Foundry VTT system localizations](https://foundryvtt.com/packages/blades-in-the-dark), [Roll20 sheet translations](https://github.com/Roll20/roll20-character-sheets/tree/master/Blades%20in%20the%20Dark/translations)

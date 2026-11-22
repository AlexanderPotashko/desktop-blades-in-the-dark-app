# model

Zod 4 schemas and inferred types: `content.ts` (book data), `character.ts` (sheet document, `schemaVersion: 1`),
`rules.ts` (Table rules, `BOOK_RULES`), `campaign.ts` (campaign, GM ruling), `common.ts` (ids, counter preset, talent mods).

- Book entities use slug ids (`leech`, `fortitude`); everything the user creates uses UUIDs. `ContentId` rejects
  UUID-shaped strings, so an `EntityRef` (either) always tells book from custom. Custom talents/traumas work wherever
  book ones do (special armor, counters, `fromTalent`); `talents` holds book ids only, custom ones live in `customTalents`.
- Content ids are unique across all of `content/core` (tested), so one id = one entity in every locale file.
- `Character` fills defaults for omitted fields (fresh objects per parse); `TableRules` has none (use `BOOK_RULES`),
  so `rulesOverride` stays partial.
- All document objects are strict: an unknown key is an error, never silently dropped.
- The campaign link is the `characters.campaign_id` column, not a document field. Deleting a campaign copies its
  `rules` into each sheet's `rulesOverride` first, so house rules are never silently replaced by book rules.
- Book item = `bookId` set. `sub` absent = book contents; `[]` = the user emptied it.
- Counter `max`: absent = no limit, `0` = capped at 0 (the prototype allows 0).

## Prototype `fresh()` → schema

Prototype item keys (`s0` special, `c0` common, `u0` own, `p0` project, `w0` workshop) become UUIDs; book items keep their id in `bookId`.

| Prototype | Schema |
|---|---|
| `name`, `alias`, `look`, `day` | same |
| `bioNote` | `notes` |
| `heritage`/`heritageNote`, `background`/`…Note`, `vice`/`viceNote` | `heritage`/`background`/`vice`: `{bookId?, name?, note}` (book name → `bookId`, other text → `name`) |
| `actions` (Russian names) | `actions` keyed by action id |
| `xp` `Чутьё/Удаль/Воля/Талант` | `xp.insight/prowess/resolve/playbook` |
| `stress` | `stress` |
| `trauma`, `traumaExtra` | `trauma` (ids), `customTraumas` `{id,name,text}` |
| `h3`, `h2a/h2b`, `h1a/h1b` | `harm.l3`, `harm.l2`, `harm.l1` |
| `heal` | `healing` |
| `armorUsed` | `armorUsed` keyed by item UUID |
| `spec` | `specialArmorUsed` |
| `armor` (`a/h/s`, legacy) | dropped: already migrated by the prototype into `armorUsed`/`spec` |
| `coin`, `stash`, `dr`, `drm` | `money.coins/stash/major/minor` (all four kept; rules pick which one shows) |
| `load` `'3'/'5'/'6'` | `load` `light/normal/heavy` |
| `talents` (Russian names) | `talents` (ids) |
| `customTalents` `{id,n,x}` | `customTalents` `{id,name,text,specialArmor,counter?,mods?}` |
| `items` + `base`, `bqty`, `btake`, `nameOv`, `loadOv`, `armorOv`, `subOv`, `itemNotes`, `itemProps`, `open` | one `Item` per book item: `qty`, `carried`, `name`, `load`, `props.armor`, `sub` (absent when no `subOv`), `note`, `props`, `open` |
| `custom` `{n,l,qty,take,base,sub,note,open,armor,…props}` | `Item` without `bookId` |
| `bandolier[0..2]`, `bandQ[0..2]` | `slots` of the bandolier item |
| `bandolier[3..5]`, `bandQ[3..5]` | dropped: second bandolier is not in the Russian rulebook, hidden in the prototype |
| `ws` (own `{n,l,qty,…}` or `{book:id}`) | `Item` with `place:'workshop'` |
| `prod` `{n,v,m,q,l,sub,note,open,…props}` | `workshop`: `WorkItem` `{name,done,total,qty,load,sub,note,open,props}` |
| item props `type` `алхимия/магия/искровой`, `q`, `good`, `uses`, `left`, `gives`, `flaws` | `props.type` `alchemical/arcane/spark-craft`, `quality` (`''` → absent = crew tier), `fine`, `uses`, `usesLeft`, `gives`, `flaws` (book flaws → ids, others as text) |
| sub entries: string or `{n,q}` | `SubItem` `{id,name,qty?}` |
| `counters` `{id,n,v,max,r,h,from}` | `counters` `{id,name,value,max?,reset,hint?,fromTalent?}`; `max:''` → absent, `max:0` stays 0, `r:'none'` → `manual` |
| `ctrOrder` | array order of `counters` (special-armor boxes are not reorderable) |
| `presetDone` | `presetsApplied` |
| `tc` (legacy) | dropped: values already moved into counters by `presetSync` |
| `cards` `{t,x,pin,rule,imgs,plan}` | `cards` `{title,text,pinned,kind:'note'|'rule',images,plan}` |
| `plan` `{f, floors:[{n,s}], v:{x,y,z}}` | `plan` `{current, floors:[{id,name,shapes}], view:{x,y,zoom}}` |
| shapes `k:'r'/'i'/'l'(d 0/1/2)/'p'/'t'/'m'` | `kind` `room/image/wall/door/window/pen/text/mark`, `t` → `label`/`text`, `g` → `glyph`, `pts` → `points`; each shape gets a UUID |
| `friends` `{name: 'up'/'down'/''}` | `contacts` `{id,bookId,rel,note}` (first); `''` (hidden) → absent |
| `contacts` `{id,n,rel}` | `contacts` `{id,name,rel,note}` (after the book ones) |
| `rules` | campaign `rules`, or `rulesOverride` for a sheet without a campaign (below) |
| `notes` (legacy) | dropped: the prototype already moved it into a card |
| `mig1`, `mig2` | dropped: one-off migration flags, applied by the importer |
| `tips`, `rbPage`, `cardSel`, `cardMode`, `cardKind`, `noteView` | dropped from the document: UI state, goes to the `settings` table |
| `ai`, `aiPort`, `aiToken` | AI agent settings: belong to the `settings` table only, never to the document or any export; the importer drops them |

### `rules` → `TableRules`

| Prototype | Schema |
|---|---|
| `mode` | `mode` |
| `money`, `major`, `minor`, `rate` | `money.book/major/minor/rate` |
| `carry` | `load` |
| `stress`, `stressN` | `stress.book/boxes` |
| `talentXP` | `playbookXpBoxes` |
| `band` | `bandolier` (`true` → `book`) |
| `presets` | `presets` (`true` → `book`) |
| hard-coded `TC` presets with `book:false` (Venomous) | `talentPresets` |
| `day` | `dayCounter` |
| `rest2` | `downtime.book=false` + two `options` (+1 healing −1 stress / −2 stress) |
| `stage` | `skillStage` |
| `tier` | `crewTier` |
| — (house rule "foreign ability ×2") | `foreignTalentCost` |
| `OUR_RULES` (saves without `rules`) | importer applies it as the override, as the prototype does |

Hard-coded prototype data (`D.talents`, `TC` book presets, `SPECIAL`, `D.special`/`D.common`/`D.contents`, `BOOK_ARMOR`)
moves to `content/` as `Talent.counter`, `Talent.specialArmor`, `ContentItem.load/armor` and localized `list`.

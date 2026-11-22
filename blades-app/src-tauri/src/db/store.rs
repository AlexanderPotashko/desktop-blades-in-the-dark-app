//! All queries. Every write runs in one transaction (dropped without commit = rolled back).
//! Character documents are opaque JSON here; Zod validates their shape in TypeScript. Only `$.id` is read.
use super::{backup, DbError, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::Path;

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
pub const REVISIONS_KEEP_LAST: i64 = 50;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRow {
    pub id: String,
    pub name: Option<String>,
    pub playbook: Option<String>,
    pub campaign_id: Option<String>,
    pub archived: bool,
    pub updated_at: String,
    pub alias: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionRow {
    pub id: i64,
    pub created_at: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub id: i64,
    pub character_id: String,
    pub created_at: String,
    pub reason: String,
    pub doc: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignRow {
    pub id: String,
    pub name: String,
    pub rules: Value,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ruling {
    pub id: String,
    pub campaign_id: String,
    pub date: String,
    pub author: String,
    pub quote: String,
    #[serde(default)]
    pub topic: Option<String>,
}

fn non_empty_str(v: &Value, key: &str, what: &str) -> Result<String> {
    match v.get(key).and_then(Value::as_str) {
        Some(s) if !s.is_empty() => Ok(s.to_owned()),
        _ => Err(DbError::Invalid(format!("{what} has no \"{key}\""))),
    }
}

// ---------- characters ----------

pub fn list_characters(conn: &Connection, include_archived: bool) -> Result<Vec<CharacterRow>> {
    let mut st = conn.prepare(
        "SELECT id, name, playbook, campaign_id, archived, updated_at, json_extract(doc, '$.alias') FROM characters
         WHERE ?1 OR archived = 0 ORDER BY name COLLATE NOCASE, id",
    )?;
    let rows = st.query_map([include_archived], |r| {
        Ok(CharacterRow {
            id: r.get(0)?,
            name: r.get(1)?,
            playbook: r.get(2)?,
            campaign_id: r.get(3)?,
            archived: r.get::<_, i64>(4)? != 0,
            updated_at: r.get(5)?,
            alias: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

pub fn get_character(conn: &Connection, id: &str) -> Result<String> {
    conn.query_row("SELECT doc FROM characters WHERE id = ?1", [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| DbError::NotFound(format!("character {id}")))
}

/// Upsert by `$.id`. `campaign_id = None` keeps the current link (see `set_character_campaign`).
pub fn save_character(conn: &Connection, doc_json: &str, campaign_id: Option<&str>) -> Result<String> {
    let doc: Value = serde_json::from_str(doc_json)?;
    let id = non_empty_str(&doc, "id", "character document")?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        &format!(
            "INSERT INTO characters (id, campaign_id, doc, updated_at) VALUES (?1, ?2, ?3, {NOW})
             ON CONFLICT(id) DO UPDATE SET
               campaign_id = COALESCE(excluded.campaign_id, characters.campaign_id),
               doc = excluded.doc, updated_at = excluded.updated_at"
        ),
        params![id, campaign_id, doc_json],
    )?;
    tx.commit()?;
    Ok(id)
}

/// Leaving a campaign copies its rules into the sheet's `rulesOverride` (own groups win), like deleting it,
/// so house rules never silently fall back to the book.
pub fn set_character_campaign(conn: &Connection, id: &str, campaign_id: Option<&str>) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    let (old, doc): (Option<String>, String) = tx
        .query_row("SELECT campaign_id, doc FROM characters WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?
        .ok_or_else(|| DbError::NotFound(format!("character {id}")))?;
    if let Some(old) = old.filter(|o| Some(o.as_str()) != campaign_id) {
        let rules: Option<String> =
            tx.query_row("SELECT rules FROM campaigns WHERE id = ?1", [&old], |r| r.get(0)).optional()?;
        if let Some(rules) = rules {
            let mut merged: Map<String, Value> = serde_json::from_str(&rules)?;
            let doc: Value = serde_json::from_str(&doc)?;
            if let Some(Value::Object(own)) = doc.get("rulesOverride") {
                merged.extend(own.clone());
            }
            tx.execute(
                "UPDATE characters SET doc = json_set(doc, '$.rulesOverride', json(?2)) WHERE id = ?1",
                params![id, serde_json::to_string(&merged)?],
            )?;
        }
    }
    tx.execute("UPDATE characters SET campaign_id = ?2 WHERE id = ?1", params![id, campaign_id])?;
    tx.commit()?;
    Ok(())
}

pub fn archive_character(conn: &Connection, id: &str, archived: bool) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    let n = tx.execute("UPDATE characters SET archived = ?2 WHERE id = ?1", params![id, archived])?;
    if n == 0 {
        return Err(DbError::NotFound(format!("character {id}")));
    }
    tx.commit()?;
    Ok(())
}

/// Backs up first (reason "pre-delete"); revisions go with the sheet (ON DELETE CASCADE).
pub fn delete_character(conn: &Connection, backup_dir: &Path, id: &str) -> Result<()> {
    get_character(conn, id)?;
    backup::backup(conn, backup_dir, "pre-delete")?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM characters WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok(())
}

// ---------- revisions ----------

/// Snapshots the current document, then prunes: keep the last 50 plus the newest of each calendar day (local time).
pub fn save_revision(conn: &Connection, character_id: &str, reason: &str) -> Result<i64> {
    let tx = conn.unchecked_transaction()?;
    let n = tx.execute(
        "INSERT INTO revisions (character_id, reason, doc) SELECT id, ?2, doc FROM characters WHERE id = ?1",
        params![character_id, reason],
    )?;
    if n == 0 {
        return Err(DbError::NotFound(format!("character {character_id}")));
    }
    let rev = tx.last_insert_rowid();
    prune_revisions(&tx, character_id)?;
    tx.commit()?;
    Ok(rev)
}

pub fn prune_revisions(conn: &Connection, character_id: &str) -> Result<usize> {
    Ok(conn.execute(
        "DELETE FROM revisions WHERE character_id = ?1
           AND id NOT IN (SELECT id FROM revisions WHERE character_id = ?1 ORDER BY id DESC LIMIT ?2)
           AND id NOT IN (SELECT max(id) FROM revisions WHERE character_id = ?1 GROUP BY date(created_at, 'localtime'))",
        params![character_id, REVISIONS_KEEP_LAST],
    )?)
}

pub fn list_revisions(conn: &Connection, character_id: &str) -> Result<Vec<RevisionRow>> {
    let mut st = conn.prepare("SELECT id, created_at, reason FROM revisions WHERE character_id = ?1 ORDER BY id DESC")?;
    let rows = st.query_map([character_id], |r| Ok(RevisionRow { id: r.get(0)?, created_at: r.get(1)?, reason: r.get(2)? }))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

pub fn get_revision(conn: &Connection, id: i64) -> Result<Revision> {
    conn.query_row("SELECT id, character_id, created_at, reason, doc FROM revisions WHERE id = ?1", [id], |r| {
        Ok(Revision { id: r.get(0)?, character_id: r.get(1)?, created_at: r.get(2)?, reason: r.get(3)?, doc: r.get(4)? })
    })
    .optional()?
    .ok_or_else(|| DbError::NotFound(format!("revision {id}")))
}

// ---------- campaigns ----------

pub fn list_campaigns(conn: &Connection) -> Result<Vec<CampaignRow>> {
    let mut st = conn.prepare("SELECT id, name, rules, updated_at FROM campaigns ORDER BY name COLLATE NOCASE, id")?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)))?;
    let mut out = vec![];
    for row in rows {
        let (id, name, rules, updated_at) = row?;
        out.push(CampaignRow { id, name, rules: serde_json::from_str(&rules)?, updated_at });
    }
    Ok(out)
}

/// `json` = `{ id, name, rules }`.
pub fn save_campaign(conn: &Connection, json: &str) -> Result<String> {
    let v: Value = serde_json::from_str(json)?;
    let id = non_empty_str(&v, "id", "campaign")?;
    let name = non_empty_str(&v, "name", "campaign")?;
    let rules = v.get("rules").filter(|r| r.is_object()).ok_or_else(|| DbError::Invalid("campaign has no \"rules\" object".into()))?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        &format!(
            "INSERT INTO campaigns (id, name, rules, updated_at) VALUES (?1, ?2, ?3, {NOW})
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, rules = excluded.rules, updated_at = excluded.updated_at"
        ),
        params![id, name, serde_json::to_string(rules)?],
    )?;
    tx.commit()?;
    Ok(id)
}

/// Backs up first. In ONE transaction: every member sheet gets the campaign's rules as `rulesOverride`
/// (its own override groups win, since an override replaces whole top-level groups), then the link is cut
/// and the campaign (with its rulings) is deleted. House rules never silently fall back to the book.
pub fn delete_campaign(conn: &Connection, backup_dir: &Path, id: &str) -> Result<()> {
    let rules: String = conn
        .query_row("SELECT rules FROM campaigns WHERE id = ?1", [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| DbError::NotFound(format!("campaign {id}")))?;
    let campaign_rules: Map<String, Value> = serde_json::from_str(&rules)?;
    backup::backup(conn, backup_dir, "pre-delete")?;

    let tx = conn.unchecked_transaction()?;
    let members: Vec<(String, String)> = {
        let mut st = tx.prepare("SELECT id, doc FROM characters WHERE campaign_id = ?1")?;
        let rows = st.query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect::<std::result::Result<_, _>>()?
    };
    for (cid, doc) in members {
        let doc: Value = serde_json::from_str(&doc)?;
        let mut merged = campaign_rules.clone();
        if let Some(Value::Object(own)) = doc.get("rulesOverride") {
            merged.extend(own.clone());
        }
        tx.execute(
            "UPDATE characters SET doc = json_set(doc, '$.rulesOverride', json(?2)), campaign_id = NULL,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
            params![cid, serde_json::to_string(&merged)?],
        )?;
    }
    tx.execute("DELETE FROM campaigns WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok(())
}

// ---------- rulings ----------

pub fn add_ruling(conn: &Connection, json: &str) -> Result<String> {
    let r: Ruling = serde_json::from_str(json)?;
    if r.id.is_empty() || r.quote.is_empty() || r.author.is_empty() || r.date.is_empty() {
        return Err(DbError::Invalid("ruling needs id, date, author and a non-empty quote".into()));
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO rulings (id, campaign_id, date, author, quote, topic) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![r.id, r.campaign_id, r.date, r.author, r.quote, r.topic],
    )?;
    tx.commit()?;
    Ok(r.id)
}

pub fn list_rulings(conn: &Connection, campaign_id: &str) -> Result<Vec<Ruling>> {
    let mut st = conn.prepare(
        "SELECT id, campaign_id, date, author, quote, topic FROM rulings WHERE campaign_id = ?1 ORDER BY date, rowid",
    )?;
    let rows = st.query_map([campaign_id], |r| {
        Ok(Ruling { id: r.get(0)?, campaign_id: r.get(1)?, date: r.get(2)?, author: r.get(3)?, quote: r.get(4)?, topic: r.get(5)? })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

// ---------- settings ----------

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()?)
}

pub fn set_setting(conn: &Connection, key: &str, value_json: &str) -> Result<()> {
    serde_json::from_str::<Value>(value_json)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value_json],
    )?;
    tx.commit()?;
    Ok(())
}

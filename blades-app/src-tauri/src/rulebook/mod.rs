//! Rulebook: pages imported by the user (never shipped), ranked full-text search over stemmed text.
//! FTS5 is contentless: it holds stems only; snippets and highlighting come from `rb_pages.text`.
pub mod commands;
pub mod stem;
#[cfg(test)]
mod tests;

use crate::db::{backup, DbError, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use stem::Stemmers;

#[derive(Debug, Deserialize)]
pub struct ImportPage {
    pub pdf: i64,
    pub book: i64,
    pub text: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
pub struct TocEntry {
    pub title: String,
    /// book page
    pub page: i64,
    pub level: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulebookInfo {
    pub id: String,
    pub title: String,
    pub imported_at: String,
    pub pages: i64,
}

#[derive(Debug, Serialize)]
pub struct Page {
    pub pdf: i64,
    pub book: i64,
    pub text: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Seg {
    pub text: String,
    pub hit: bool,
}

#[derive(Debug, Serialize)]
pub struct Hit {
    pub pdf: i64,
    pub book: i64,
    /// Plain text pieces, `hit` marks matched words. The UI renders them as text, never as HTML.
    pub snippet: Vec<Seg>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: String,
    pub page: i64,
    pub title: String,
    pub created_at: String,
}

fn bad(m: &str) -> DbError {
    DbError::Invalid(m.into())
}

/// The rulebook all single-book commands work on: the most recently imported one.
fn current(conn: &Connection) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT id FROM rulebooks ORDER BY imported_at DESC, rowid DESC LIMIT 1", [], |r| r.get(0))
        .optional()?)
}

/// Replaces a rulebook with the same title (after a backup; its bookmarks are carried over) in ONE transaction.
/// `lang` is validated only: stemmers are chosen per word by script (Cyrillic -> Russian, else English).
pub fn import_pages(
    conn: &Connection,
    backup_dir: &Path,
    title: &str,
    lang: &str,
    pages: &[ImportPage],
    toc: &[TocEntry],
) -> Result<RulebookInfo> {
    if title.trim().is_empty() {
        return Err(bad("rulebook title is empty"));
    }
    if !matches!(lang, "ru" | "en") {
        return Err(bad("lang must be \"ru\" or \"en\""));
    }
    if pages.is_empty() {
        return Err(bad("no pages to import"));
    }
    let old: Option<String> =
        conn.query_row("SELECT id FROM rulebooks WHERE title = ?1", [title], |r| r.get(0)).optional()?;
    if old.is_some() {
        backup::backup(conn, backup_dir, "pre-import")?;
    }
    let st = Stemmers::new();
    let tx = conn.unchecked_transaction()?; // dropped without commit = rollback
    let kept: Vec<(i64, String, String)> = match &old {
        Some(id) => {
            let mut q = tx.prepare("SELECT page, title, created_at FROM bookmarks WHERE rulebook_id = ?1")?;
            let rows = q.query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<_>>()?;
            drop(q);
            tx.execute("DELETE FROM rulebooks WHERE id = ?1", [id])?; // cascades pages, toc, bookmarks, FTS rows
            rows
        }
        None => vec![],
    };
    let id: String = tx.query_row("SELECT lower(hex(randomblob(8)))", [], |r| r.get(0))?;
    tx.execute("INSERT INTO rulebooks(id, title) VALUES (?1, ?2)", params![id, title])?;
    {
        let mut ins = tx.prepare("INSERT INTO rb_pages(rulebook_id, pdf, book, text) VALUES (?1, ?2, ?3, ?4)")?;
        let mut fts = tx.prepare("INSERT INTO rb_fts(rowid, stemmed) VALUES (?1, ?2)")?;
        for p in pages {
            ins.execute(params![id, p.pdf, p.book, p.text])?;
            fts.execute(params![tx.last_insert_rowid(), st.stem_text(&p.text)])?;
        }
        let mut t = tx.prepare("INSERT INTO rb_toc(rulebook_id, ord, title, page, level) VALUES (?1, ?2, ?3, ?4, ?5)")?;
        for (i, e) in toc.iter().enumerate() {
            t.execute(params![id, i as i64, e.title, e.page, e.level])?;
        }
        let mut b = tx.prepare(
            "INSERT INTO bookmarks(id, rulebook_id, page, title, created_at) VALUES (lower(hex(randomblob(8))), ?1, ?2, ?3, ?4)",
        )?;
        for (page, title, at) in &kept {
            b.execute(params![id, page, title, at])?;
        }
    }
    tx.commit()?;
    list(conn)?.into_iter().find(|r| r.id == id).ok_or_else(|| bad("import vanished"))
}

pub fn list(conn: &Connection) -> Result<Vec<RulebookInfo>> {
    let mut q = conn.prepare(
        "SELECT r.id, r.title, r.imported_at, (SELECT count(*) FROM rb_pages p WHERE p.rulebook_id = r.id)
         FROM rulebooks r ORDER BY r.imported_at DESC, r.rowid DESC",
    )?;
    let rows = q.query_map([], |r| Ok(RulebookInfo { id: r.get(0)?, title: r.get(1)?, imported_at: r.get(2)?, pages: r.get(3)? }))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    if conn.execute("DELETE FROM rulebooks WHERE id = ?1", [id])? == 0 {
        return Err(DbError::NotFound(format!("rulebook {id}")));
    }
    Ok(())
}

pub fn toc(conn: &Connection) -> Result<Vec<TocEntry>> {
    let Some(id) = current(conn)? else { return Ok(vec![]) };
    let mut q = conn.prepare("SELECT title, page, level FROM rb_toc WHERE rulebook_id = ?1 ORDER BY ord")?;
    let rows = q.query_map([id], |r| Ok(TocEntry { title: r.get(0)?, page: r.get(1)?, level: r.get(2)? }))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Looks a page up by PDF page (`by_book` false) or by printed book page.
pub fn page(conn: &Connection, n: i64, by_book: bool) -> Result<Page> {
    let col = if by_book { "book" } else { "pdf" };
    let id = current(conn)?.ok_or_else(|| DbError::NotFound("no rulebook imported".into()))?;
    conn.query_row(
        &format!("SELECT pdf, book, text FROM rb_pages WHERE rulebook_id = ?1 AND {col} = ?2"),
        params![id, n],
        |r| Ok(Page { pdf: r.get(0)?, book: r.get(1)?, text: r.get(2)? }),
    )
    .optional()?
    .ok_or_else(|| DbError::NotFound(format!("page {n}")))
}

/// bm25-ranked search. Whole stems first; if nothing matches, every stem as a prefix (`word*`).
pub fn search(conn: &Connection, query: &str, limit: usize) -> Result<Vec<Hit>> {
    let st = Stemmers::new();
    let mut stems = st.stem_words(query);
    stems.dedup();
    stems.truncate(12);
    let Some(id) = current(conn)? else { return Ok(vec![]) };
    if stems.is_empty() {
        return Ok(vec![]);
    }
    for prefix in [false, true] {
        let m = stems.iter().map(|s| format!("\"{s}\"{}", if prefix { "*" } else { "" })).collect::<Vec<_>>().join(" ");
        let mut q = conn.prepare_cached(
            "SELECT p.pdf, p.book, p.text FROM rb_fts JOIN rb_pages p ON p.id = rb_fts.rowid
             WHERE rb_fts MATCH ?1 AND p.rulebook_id = ?2 ORDER BY bm25(rb_fts), p.pdf LIMIT ?3",
        )?;
        let rows = q.query_map(params![m, id, limit as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?)))?;
        let mut hits = vec![];
        for r in rows {
            let (pdf, book, text) = r?;
            hits.push(Hit { pdf, book, snippet: st.snippet(&text, &stems, prefix) });
        }
        if !hits.is_empty() {
            return Ok(hits);
        }
    }
    Ok(vec![])
}

pub fn add_bookmark(conn: &Connection, page: i64, title: &str) -> Result<String> {
    let rb = current(conn)?.ok_or_else(|| DbError::NotFound("no rulebook imported".into()))?;
    let id: String = conn.query_row("SELECT lower(hex(randomblob(8)))", [], |r| r.get(0))?;
    conn.execute("INSERT INTO bookmarks(id, rulebook_id, page, title) VALUES (?1, ?2, ?3, ?4)", params![id, rb, page, title])?;
    Ok(id)
}

pub fn list_bookmarks(conn: &Connection) -> Result<Vec<Bookmark>> {
    let Some(rb) = current(conn)? else { return Ok(vec![]) };
    let mut q = conn.prepare("SELECT id, page, title, created_at FROM bookmarks WHERE rulebook_id = ?1 ORDER BY page, rowid")?;
    let rows = q.query_map([rb], |r| Ok(Bookmark { id: r.get(0)?, page: r.get(1)?, title: r.get(2)?, created_at: r.get(3)? }))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn delete_bookmark(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", [id])?;
    Ok(())
}

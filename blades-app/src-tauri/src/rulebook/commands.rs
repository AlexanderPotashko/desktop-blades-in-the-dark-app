//! Tauri commands for the rulebook. Keep in sync with build.rs and capabilities/default.json.
use super::{Bookmark, Hit, ImportPage, Page, RulebookInfo, TocEntry};
use crate::db::{Db, DbError, Result};
use tauri::{ipc::Response, State};
use tauri_plugin_dialog::DialogExt;

/// Largest file the import dialog may read (the whole Russian rulebook PDF is ~20 MB).
const MAX_SOURCE: u64 = 200 * 1024 * 1024;

/// Opens the system file dialog and returns the bytes of the ONE file the user picked (empty = cancelled).
/// This is the only way the window reads a file: no fs plugin, no path comes from the UI.
#[tauri::command]
pub async fn rb_pick_source(app: tauri::AppHandle, extensions: Vec<String>) -> Result<Response> {
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let Some(picked) = app.dialog().file().add_filter("Rulebook", &exts).blocking_pick_file() else {
        return Ok(Response::new(Vec::new()));
    };
    let path = picked.into_path().map_err(|e| DbError::Invalid(e.to_string()))?;
    if std::fs::metadata(&path)?.len() > MAX_SOURCE {
        return Err(DbError::Invalid("file is too large".into()));
    }
    Ok(Response::new(std::fs::read(path)?))
}

#[tauri::command]
pub async fn rb_import_pages(
    db: State<'_, Db>,
    title: String,
    lang: String,
    pages: Vec<ImportPage>,
    toc: Vec<TocEntry>,
) -> Result<RulebookInfo> {
    db.with(|c| super::import_pages(c, db.backup_dir(), &title, &lang, &pages, &toc))
}

#[tauri::command]
pub async fn rb_search(db: State<'_, Db>, query: String, limit: usize) -> Result<Vec<Hit>> {
    db.with(|c| super::search(c, &query, limit.min(200)))
}

#[tauri::command]
pub async fn rb_page(db: State<'_, Db>, pdf: i64) -> Result<Page> {
    db.with(|c| super::page(c, pdf, false))
}

#[tauri::command]
pub async fn rb_page_by_book(db: State<'_, Db>, book: i64) -> Result<Page> {
    db.with(|c| super::page(c, book, true))
}

#[tauri::command]
pub async fn rb_toc(db: State<'_, Db>) -> Result<Vec<TocEntry>> {
    db.with(super::toc)
}

#[tauri::command]
pub async fn rb_list(db: State<'_, Db>) -> Result<Vec<RulebookInfo>> {
    db.with(super::list)
}

#[tauri::command]
pub async fn rb_delete(db: State<'_, Db>, id: String) -> Result<()> {
    db.with(|c| super::delete(c, &id))
}

#[tauri::command]
pub async fn rb_add_bookmark(db: State<'_, Db>, page: i64, title: String) -> Result<String> {
    db.with(|c| super::add_bookmark(c, page, &title))
}

#[tauri::command]
pub async fn rb_list_bookmarks(db: State<'_, Db>) -> Result<Vec<Bookmark>> {
    db.with(super::list_bookmarks)
}

#[tauri::command]
pub async fn rb_delete_bookmark(db: State<'_, Db>, id: String) -> Result<()> {
    db.with(|c| super::delete_bookmark(c, &id))
}

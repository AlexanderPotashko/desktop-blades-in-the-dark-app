//! Tauri commands: the only DB surface for the UI. Thin wrappers over `store` / `backup`.
//! Async so that backups and restores run off the main thread.
use super::backup::BackupInfo;
use super::store::{self, CampaignRow, CharacterRow, Revision, RevisionRow, Ruling};
use super::{Db, Result};
use std::path::Path;
use tauri::State;

/// Keep in sync with `commands(...)` in build.rs and the permissions in capabilities/default.json.
#[tauri::command]
pub async fn list_characters(db: State<'_, Db>, include_archived: bool) -> Result<Vec<CharacterRow>> {
    db.with(|c| store::list_characters(c, include_archived))
}

#[tauri::command]
pub async fn get_character(db: State<'_, Db>, id: String) -> Result<String> {
    db.with(|c| store::get_character(c, &id))
}

#[tauri::command]
pub async fn save_character(db: State<'_, Db>, doc_json: String, campaign_id: Option<String>) -> Result<String> {
    db.with(|c| store::save_character(c, &doc_json, campaign_id.as_deref()))
}

#[tauri::command]
pub async fn set_character_campaign(db: State<'_, Db>, id: String, campaign_id: Option<String>) -> Result<()> {
    db.with(|c| store::set_character_campaign(c, &id, campaign_id.as_deref()))
}

#[tauri::command]
pub async fn archive_character(db: State<'_, Db>, id: String, archived: bool) -> Result<()> {
    db.with(|c| store::archive_character(c, &id, archived))
}

#[tauri::command]
pub async fn delete_character(db: State<'_, Db>, id: String) -> Result<()> {
    db.with(|c| store::delete_character(c, db.backup_dir(), &id))
}

#[tauri::command]
pub async fn save_revision(db: State<'_, Db>, character_id: String, reason: String) -> Result<i64> {
    db.with(|c| store::save_revision(c, &character_id, &reason))
}

#[tauri::command]
pub async fn list_revisions(db: State<'_, Db>, character_id: String) -> Result<Vec<RevisionRow>> {
    db.with(|c| store::list_revisions(c, &character_id))
}

#[tauri::command]
pub async fn get_revision(db: State<'_, Db>, id: i64) -> Result<Revision> {
    db.with(|c| store::get_revision(c, id))
}

#[tauri::command]
pub async fn list_campaigns(db: State<'_, Db>) -> Result<Vec<CampaignRow>> {
    db.with(store::list_campaigns)
}

#[tauri::command]
pub async fn save_campaign(db: State<'_, Db>, json: String) -> Result<String> {
    db.with(|c| store::save_campaign(c, &json))
}

#[tauri::command]
pub async fn delete_campaign(db: State<'_, Db>, id: String) -> Result<()> {
    db.with(|c| store::delete_campaign(c, db.backup_dir(), &id))
}

#[tauri::command]
pub async fn add_ruling(db: State<'_, Db>, json: String) -> Result<String> {
    db.with(|c| store::add_ruling(c, &json))
}

#[tauri::command]
pub async fn list_rulings(db: State<'_, Db>, campaign_id: String) -> Result<Vec<Ruling>> {
    db.with(|c| store::list_rulings(c, &campaign_id))
}

#[tauri::command]
pub async fn get_setting(db: State<'_, Db>, key: String) -> Result<Option<String>> {
    db.with(|c| store::get_setting(c, &key))
}

#[tauri::command]
pub async fn set_setting(db: State<'_, Db>, key: String, value_json: String) -> Result<()> {
    db.with(|c| store::set_setting(c, &key, &value_json))
}

#[tauri::command]
pub async fn backup_now(db: State<'_, Db>) -> Result<String> {
    Ok(db.backup("manual")?.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_backups(db: State<'_, Db>) -> Result<Vec<BackupInfo>> {
    db.list_backups()
}

/// Returns the path of the automatic "pre-restore" backup.
#[tauri::command]
pub async fn restore_backup(db: State<'_, Db>, path: String) -> Result<String> {
    Ok(db.restore(Path::new(&path))?.to_string_lossy().into_owned())
}

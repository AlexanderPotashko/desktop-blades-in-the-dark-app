//! Export / import of `.blades.json` files. Like `rb_pick_source`, the window never gets a path or an fs plugin:
//! the native dialog is opened here and only the ONE picked file is written (export) or read (import).
use crate::db::{DbError, Result};
use std::path::{Path, PathBuf};
use tauri::ipc::Response;
use tauri_plugin_dialog::DialogExt;

/// An export of a whole library with images stays far below this; a bigger import is a wrong file.
const MAX_IMPORT: u64 = 256 * 1024 * 1024;
const FORMAT: &str = "blades-export";

/// Checks the payload is a `.blades.json` envelope (a JSON object tagged `format: "blades-export"`) and
/// returns the path with a `.json` extension. The rulebook is never part of an export: refuse if it shows up.
fn prepare(path: &Path, json: &str) -> Result<PathBuf> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    if v.get("format").and_then(|f| f.as_str()) != Some(FORMAT) {
        return Err(DbError::Invalid("not a Blades export".into()));
    }
    if v.get("rulebook").is_some() || v.get("rulebooks").is_some() {
        return Err(DbError::Invalid("the rulebook is never exported".into()));
    }
    let mut p = path.to_path_buf();
    if p.extension().and_then(|e| e.to_str()) != Some("json") {
        let mut s = p.into_os_string();
        s.push(".blades.json");
        p = PathBuf::from(s);
    }
    Ok(p)
}

pub fn write_export(path: &Path, json: &str) -> Result<PathBuf> {
    let p = prepare(path, json)?;
    std::fs::write(&p, json)?;
    Ok(p)
}

pub fn read_import(path: &Path) -> Result<String> {
    if std::fs::metadata(path)?.len() > MAX_IMPORT {
        return Err(DbError::Invalid("file is too large".into()));
    }
    String::from_utf8(std::fs::read(path)?).map_err(|_| DbError::Invalid("file is not UTF-8 text".into()))
}

/// Opens the system "save as" dialog and writes `json` to the picked path. Returns false when cancelled.
#[tauri::command]
pub async fn export_save(app: tauri::AppHandle, default_name: String, json: String) -> Result<bool> {
    // validate before bothering the user with a dialog
    prepare(Path::new("x.json"), &json)?;
    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("Blades", &["json"])
        .set_file_name(default_name)
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = picked.into_path().map_err(|e| DbError::Invalid(e.to_string()))?;
    write_export(&path, &json)?;
    Ok(true)
}

/// Opens the system file dialog and returns the picked file's bytes (empty = cancelled).
#[tauri::command]
pub async fn import_open(app: tauri::AppHandle) -> Result<Response> {
    let Some(picked) = app.dialog().file().add_filter("Blades", &["json"]).blocking_pick_file() else {
        return Ok(Response::new(Vec::new()));
    };
    let path = picked.into_path().map_err(|e| DbError::Invalid(e.to_string()))?;
    Ok(Response::new(read_import(&path)?.into_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const OK: &str = r#"{"format":"blades-export","kind":"library","characters":[]}"#;

    #[test]
    fn writes_and_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        let p = write_export(&dir.path().join("a.json"), OK).unwrap();
        assert_eq!(read_import(&p).unwrap(), OK);
    }

    #[test]
    fn adds_the_extension_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let p = write_export(&dir.path().join("a"), OK).unwrap();
        assert!(p.to_string_lossy().ends_with("a.blades.json"));
    }

    #[test]
    fn refuses_foreign_or_rulebook_payloads() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.json");
        for bad in ["not json", "[]", r#"{"format":"other"}"#, r#"{"format":"blades-export","rulebook":{}}"#] {
            assert!(write_export(&p, bad).is_err(), "{bad}");
        }
        assert!(!p.exists());
    }

    #[test]
    fn import_rejects_non_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.json");
        std::fs::write(&p, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_import(&p).is_err());
    }
}

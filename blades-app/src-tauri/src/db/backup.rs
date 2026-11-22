use super::{migrate, DbError, Result};
use chrono::Local;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const KEEP: usize = 14;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// `blades-YYYYMMDD-HHMMSS-<reason>[-n].db`; returns the `YYYYMMDD-HHMMSS` stamp.
fn stamp(name: &str) -> Option<&str> {
    let s = name.strip_prefix("blades-")?;
    if !name.ends_with(".db") || s.len() < 16 {
        return None;
    }
    let b = s.as_bytes();
    let ok = b[..8].iter().all(u8::is_ascii_digit)
        && b[8] == b'-'
        && b[9..15].iter().all(u8::is_ascii_digit)
        && b[15] == b'-';
    if ok {
        Some(&s[..15])
    } else {
        None
    }
}

pub fn backup(conn: &Connection, dir: &Path, reason: &str) -> Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let reason: String = reason
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let ts = Local::now().format("%Y%m%d-%H%M%S");
    let mut path = dir.join(format!("blades-{ts}-{reason}.db"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("blades-{ts}-{reason}-{n}.db"));
        n += 1;
    }
    // The path is bound as a parameter, so no SQL escaping is needed.
    if let Err(e) = conn.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()]) {
        let _ = std::fs::remove_file(&path);
        return Err(e.into());
    }
    rotate(dir, KEEP)?;
    Ok(path)
}

/// Deletes all but the `keep` newest backup files (timestamp order).
pub fn rotate(dir: &Path, keep: usize) -> Result<()> {
    let mut names = backup_names(dir)?;
    names.sort_unstable_by(|a, b| b.cmp(a));
    for n in names.into_iter().skip(keep) {
        std::fs::remove_file(dir.join(n))?;
    }
    Ok(())
}

fn backup_names(dir: &Path) -> Result<Vec<String>> {
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut v = vec![];
    for e in std::fs::read_dir(dir)? {
        let name = e?.file_name().to_string_lossy().into_owned();
        if stamp(&name).is_some() {
            v.push(name);
        }
    }
    Ok(v)
}

pub fn daily_backup(conn: &Connection, dir: &Path) -> Result<Option<PathBuf>> {
    let today = Local::now().format("%Y%m%d").to_string();
    if backup_names(dir)?.iter().any(|n| stamp(n).is_some_and(|s| s.starts_with(&today))) {
        return Ok(None);
    }
    backup(conn, dir, "daily").map(Some)
}

/// Newest first.
pub fn list_backups(dir: &Path) -> Result<Vec<BackupInfo>> {
    let mut names = backup_names(dir)?;
    names.sort_unstable_by(|a, b| b.cmp(a));
    names
        .into_iter()
        .map(|name| {
            let path = dir.join(&name);
            Ok(BackupInfo { size: std::fs::metadata(&path)?.len(), path: path.to_string_lossy().into_owned(), name })
        })
        .collect()
}

/// A file may be installed as the database only if it is intact and not newer than this app.
pub fn validate(file: &Path) -> Result<()> {
    let bad = |why: &str| DbError::Invalid(format!("not a usable backup: {why}"));
    let c = Connection::open_with_flags(file, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| bad(&e.to_string()))?;
    let check: String = c.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(|e| bad(&e.to_string()))?;
    if check != "ok" {
        return Err(bad(&check));
    }
    let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let latest = migrate::MIGRATIONS.len() as i64;
    if v > latest {
        return Err(DbError::TooNew { found: v, supported: latest });
    }
    if v == 0 {
        return Err(bad("empty database"));
    }
    Ok(())
}

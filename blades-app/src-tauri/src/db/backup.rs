use super::{migrate, DbError, Result};
use chrono::Local;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const KEEP: usize = 14;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub size: u64,
}

/// `blades-YYYYMMDD-HHMMSS-<reason>[-n].db`; returns the `YYYYMMDD-HHMMSS` stamp. `*.tmp` never matches.
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
    // Write beside the final name, then rename: a half-written backup never looks like a real one.
    let tmp = PathBuf::from(format!("{}.tmp", path.display()));
    let _ = std::fs::remove_file(&tmp);
    // The path is bound as a parameter, so no SQL escaping is needed.
    let made = conn
        .execute("VACUUM INTO ?1", [tmp.to_string_lossy().as_ref()])
        .map_err(DbError::from)
        .and_then(|_| std::fs::rename(&tmp, &path).map_err(DbError::from));
    if let Err(e) = made {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    // Rotation is housekeeping: a locked old file must not fail the backup or the user's action.
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        rotate(dir, KEEP, name);
    }
    Ok(path)
}

/// Keeps the `keep` newest backups AND the newest backup of each of the last `keep` calendar days
/// (the stamp is local time), so a burst of manual backups cannot push out the dailies.
/// Never deletes `just_made`. Errors are logged, not returned.
pub fn rotate(dir: &Path, keep: usize, just_made: &str) {
    let mut names = match backup_names(dir) {
        Ok(n) => n,
        Err(e) => return eprintln!("backup rotation: {e}"),
    };
    names.sort_unstable_by(|a, b| b.cmp(a));
    let mut keep_set: std::collections::HashSet<&str> = names.iter().take(keep).map(String::as_str).collect();
    let mut days: Vec<&str> = vec![];
    for n in &names {
        let day = &n["blades-".len()..][..8]; // backup_names only returns names that passed stamp()
        if !days.contains(&day) && days.len() < keep {
            days.push(day);
            keep_set.insert(n); // newest of its day: names are sorted newest first
        }
    }
    for n in &names {
        if n != just_made && !keep_set.contains(n.as_str()) {
            if let Err(e) = std::fs::remove_file(dir.join(n)) {
                eprintln!("backup rotation: cannot delete {n}: {e}");
            }
        }
    }
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
        .map(|name| Ok(BackupInfo { size: std::fs::metadata(dir.join(&name))?.len(), name }))
        .collect()
}

/// A backup is addressed by bare file name; it must exist in `dir`. Anything with a path in it is refused.
pub fn resolve(dir: &Path, name: &str) -> Result<PathBuf> {
    if stamp(name).is_none() || name.contains(['/', '\\', ':']) || name.contains("..") {
        return Err(DbError::Invalid(format!("not a backup name: {name}")));
    }
    let p = dir.join(name);
    if !p.is_file() {
        return Err(DbError::NotFound(format!("backup {name}")));
    }
    Ok(p)
}

/// A file may be installed as the database only if it is intact, not newer than this app, and has our tables.
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
    let has: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'characters')",
        [],
        |r| r.get(0),
    )?;
    if !has {
        return Err(bad("no characters table"));
    }
    Ok(())
}

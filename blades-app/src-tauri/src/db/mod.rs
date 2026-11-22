//! SQLite data layer. Plain functions over `&Connection`; Tauri commands (commands.rs) are thin wrappers.
pub mod backup;
pub mod commands;
pub mod migrate;
pub mod store;
#[cfg(test)]
mod tests;

use rusqlite::Connection;
use serde::{Serialize, Serializer};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("database error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("file error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("the database was written by a newer version of the app (schema {found}, this app supports {supported}); update the app")]
    TooNew { found: i64, supported: i64 },
}

// Errors cross the IPC boundary as plain message strings.
impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, DbError>;

pub struct Db {
    conn: Mutex<Connection>,
    path: PathBuf,
    backup_dir: PathBuf,
}

pub(crate) fn open_conn(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    Ok(conn)
}

impl Db {
    /// Opens (creating if needed) the database and migrates it. Refuses a database newer than the app.
    pub fn open(path: PathBuf, backup_dir: PathBuf) -> Result<Db> {
        let conn = open_conn(&path)?;
        migrate::migrate(&conn, &backup_dir)?;
        Ok(Db { conn: Mutex::new(conn), path, backup_dir })
    }

    fn lock(&self) -> MutexGuard<'_, Connection> {
        // A poisoned lock only means a panic elsewhere; open transactions were rolled back, the connection is fine.
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn with<R>(&self, f: impl FnOnce(&Connection) -> Result<R>) -> Result<R> {
        f(&self.lock())
    }

    pub fn backup_dir(&self) -> &Path {
        &self.backup_dir
    }

    pub fn backup(&self, reason: &str) -> Result<PathBuf> {
        self.with(|c| backup::backup(c, &self.backup_dir, reason))
    }

    /// Startup backup, only if none exists from today.
    pub fn daily_backup(&self) -> Result<Option<PathBuf>> {
        self.with(|c| backup::daily_backup(c, &self.backup_dir))
    }

    pub fn list_backups(&self) -> Result<Vec<backup::BackupInfo>> {
        backup::list_backups(&self.backup_dir)
    }

    /// Replaces the live database with `file`. Returns the path of the "pre-restore" backup.
    pub fn restore(&self, file: &Path) -> Result<PathBuf> {
        let mut guard = self.lock();
        let pre = backup::backup(&guard, &self.backup_dir, "pre-restore")?;

        // Validate exactly the bytes we are about to install: a copy beside the live db.
        let tmp = self.path.with_extension("db.restoring");
        let _ = std::fs::remove_file(&tmp);
        std::fs::copy(file, &tmp)?;
        if let Err(e) = backup::validate(&tmp) {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }

        // Swap. The in-memory placeholder lives only inside this function; every exit path reopens a real file.
        let old = std::mem::replace(&mut *guard, Connection::open_in_memory()?);
        drop(old); // closes the connection and checkpoints the WAL
        let swapped = (|| -> Result<()> {
            let _ = std::fs::remove_file(self.path.with_extension("db-wal"));
            let _ = std::fs::remove_file(self.path.with_extension("db-shm"));
            std::fs::rename(&tmp, &self.path)?;
            Ok(())
        })();
        // If the swap failed the original file is still in place, so reopening it is safe.
        *guard = open_conn(&self.path)?;
        if swapped.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        swapped?;
        migrate::migrate(&guard, &self.backup_dir)?;
        Ok(pre)
    }
}

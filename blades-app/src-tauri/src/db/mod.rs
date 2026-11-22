//! SQLite data layer. Plain functions over `&Connection`; Tauri commands (commands.rs) are thin wrappers.
pub mod backup;
pub mod commands;
pub mod migrate;
pub mod store;
#[cfg(test)]
mod tests;

use rusqlite::Connection;
use serde::ser::SerializeStruct;
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
    #[error("database unavailable, restart the app")]
    Unavailable,
}

impl DbError {
    pub fn kind(&self) -> &'static str {
        match self {
            DbError::Sql(_) => "Db",
            DbError::Io(_) => "Io",
            DbError::Json(_) | DbError::Invalid(_) => "Invalid",
            DbError::NotFound(_) => "NotFound",
            DbError::TooNew { .. } => "TooNew",
            DbError::Unavailable => "Unavailable",
        }
    }
}

// Errors cross the IPC boundary as `{ kind, message }`.
impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("DbError", 2)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

pub type Result<T> = std::result::Result<T, DbError>;

pub struct Db {
    /// `None` = no usable connection (startup failed, or a restore could not reopen the file):
    /// every command then answers `Unavailable`.
    conn: Mutex<Option<Connection>>,
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
        Ok(Db { conn: Mutex::new(Some(conn)), path, backup_dir })
    }

    /// A slot with no connection, for when startup failed: every command returns `Unavailable`.
    pub fn unavailable(path: PathBuf, backup_dir: PathBuf) -> Db {
        Db { conn: Mutex::new(None), path, backup_dir }
    }

    fn lock(&self) -> MutexGuard<'_, Option<Connection>> {
        // A poisoned lock only means a panic elsewhere; open transactions were rolled back, the connection is fine.
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn with<R>(&self, f: impl FnOnce(&Connection) -> Result<R>) -> Result<R> {
        f(self.lock().as_ref().ok_or(DbError::Unavailable)?)
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

    /// Replaces the live database with the backup called `name`. Returns the path of the "pre-restore" backup.
    pub fn restore(&self, name: &str) -> Result<PathBuf> {
        self.restore_with(name, |from, to| std::fs::rename(from, to))
    }

    /// `rename` is a seam so tests can make the final swap fail.
    fn restore_with(&self, name: &str, rename: impl Fn(&Path, &Path) -> std::io::Result<()>) -> Result<PathBuf> {
        let src = backup::resolve(&self.backup_dir, name)?;
        let mut guard = self.lock();
        let conn = guard.as_ref().ok_or(DbError::Unavailable)?;

        // 1. Copy + validate the chosen file FIRST: taking the pre-restore backup rotates old files,
        //    which could otherwise delete the very backup being restored.
        let tmp = self.path.with_extension("db.restoring");
        let _ = std::fs::remove_file(&tmp);
        std::fs::copy(&src, &tmp)?;
        if let Err(e) = backup::validate(&tmp) {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
        // 2. Safety net for the current state.
        let pre = match backup::backup(conn, &self.backup_dir, "pre-restore") {
            Ok(p) => p,
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                return Err(e);
            }
        };
        // 3. Fold the WAL into the main file so removing -wal/-shm later cannot lose anything.
        let busy: rusqlite::Result<i64> = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| r.get(0));
        if !matches!(busy, Ok(0)) {
            let _ = std::fs::remove_file(&tmp);
            return Err(DbError::Invalid("could not checkpoint the database; restore aborted, nothing changed".into()));
        }
        // 3b. A backup holds no rulebook text: keep the current one.
        if let Err(e) = backup::carry_rulebook(&tmp, &self.path) {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
        // 4. Swap. The slot stays empty (Unavailable) until a real file is open again.
        drop(guard.take());
        let swapped = rename(&tmp, &self.path);
        if swapped.is_ok() {
            // Only after a successful rename: the old -wal/-shm belong to the old file.
            let _ = std::fs::remove_file(self.path.with_extension("db-wal"));
            let _ = std::fs::remove_file(self.path.with_extension("db-shm"));
        } else {
            let _ = std::fs::remove_file(&tmp); // the original file is untouched
        }
        // 5. Reopen (retrying once). If that fails the slot stays empty and commands say "unavailable".
        let conn = open_conn(&self.path)
            .or_else(|_| open_conn(&self.path))
            .map_err(|e| DbError::Io(std::io::Error::other(format!("cannot reopen the database ({e}); restart the app"))))?;
        let c = guard.insert(conn);
        swapped?;
        if let Err(e) = migrate::migrate(c, &self.backup_dir) {
            *guard = None;
            return Err(e);
        }
        Ok(pre)
    }
}

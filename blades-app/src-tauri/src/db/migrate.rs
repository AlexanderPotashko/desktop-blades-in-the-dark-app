use super::{backup, DbError, Result};
use rusqlite::Connection;
use std::path::Path;

/// Ordered; migration N+1 turns schema version N into N+1. Never edit a shipped one, append instead.
pub const MIGRATIONS: &[&str] = &[include_str!("../../migrations/001_init.sql")];

pub fn migrate(conn: &Connection, backup_dir: &Path) -> Result<()> {
    migrate_with(conn, backup_dir, MIGRATIONS)
}

pub fn migrate_with(conn: &Connection, backup_dir: &Path, migrations: &[&str]) -> Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let latest = migrations.len() as i64;
    if current > latest {
        return Err(DbError::TooNew { found: current, supported: latest });
    }
    if current == latest {
        return Ok(());
    }
    // Version 0 is a brand-new empty file: nothing to protect.
    if current > 0 {
        backup::backup(conn, backup_dir, "pre-migration")?;
    }
    let tx = conn.unchecked_transaction()?;
    for (i, sql) in migrations.iter().enumerate().skip(current as usize) {
        tx.execute_batch(sql)?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))?;
    }
    tx.commit()?;
    Ok(())
}

use super::*;
use rusqlite::Connection;
use serde_json::{json, Value};
use tempfile::TempDir;

fn doc(id: &str, name: &str) -> String {
    json!({"id": id, "name": name, "playbookId": "leech", "schemaVersion": 1}).to_string()
}

fn open(dir: &TempDir) -> Db {
    Db::open(dir.path().join("blades.db"), dir.path().join("backups")).unwrap()
}

fn count(c: &Connection, table: &str) -> i64 {
    c.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0)).unwrap()
}

fn version(c: &Connection) -> i64 {
    c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap()
}

#[test]
fn migrates_empty_db() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    assert_eq!(db.with(|c| Ok(version(c))).unwrap(), migrate::MIGRATIONS.len() as i64);
    // fresh file: no pre-migration backup
    assert!(db.list_backups().unwrap().is_empty());
}

#[test]
fn migration_makes_pre_migration_backup_and_applies_in_order() {
    let dir = TempDir::new().unwrap();
    let bdir = dir.path().join("b");
    let c = open_conn(&dir.path().join("x.db")).unwrap();
    migrate::migrate_with(&c, &bdir, &["CREATE TABLE a(x)"]).unwrap();
    c.execute("INSERT INTO a VALUES (1)", []).unwrap();
    migrate::migrate_with(&c, &bdir, &["CREATE TABLE a(x)", "CREATE TABLE b(y)"]).unwrap();
    assert_eq!(version(&c), 2);
    let backups = backup::list_backups(&bdir).unwrap();
    assert_eq!(backups.len(), 1);
    assert!(backups[0].name.ends_with("-pre-migration.db"));
    let old = Connection::open(bdir.join(&backups[0].name)).unwrap();
    assert_eq!(version(&old), 1); // backup holds the pre-migration state
    assert_eq!(count(&old, "a"), 1);
}

#[test]
fn refuses_newer_db() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("blades.db");
    {
        let c = Connection::open(&path).unwrap();
        c.execute_batch("PRAGMA user_version = 99").unwrap();
    }
    match Db::open(path, dir.path().join("backups")) {
        Err(DbError::TooNew { found: 99, .. }) => {}
        Err(e) => panic!("wrong error: {e}"),
        Ok(_) => panic!("opened a newer db"),
    }
}

#[test]
fn backup_is_valid_db_with_same_rows() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        store::save_character(c, &doc("a", "A"), None)?;
        store::save_character(c, &doc("b", "B"), None)?;
        store::save_revision(c, "a", "t")?;
        store::set_setting(c, "k", "1")
    })
    .unwrap();
    let path = db.backup("manual").unwrap();
    assert!(path.exists());
    let b = Connection::open(&path).unwrap();
    assert_eq!(version(&b), migrate::MIGRATIONS.len() as i64);
    for t in ["characters", "revisions", "settings", "campaigns", "rulings"] {
        let live = db.with(|c| Ok(count(c, t))).unwrap();
        assert_eq!(count(&b, t), live, "{t}");
    }
    assert_eq!(count(&b, "characters"), 2);
}

#[test]
fn backup_name_collision_and_odd_reason() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    let a = db.backup("pre delete!").unwrap();
    let b = db.backup("pre delete!").unwrap();
    assert_ne!(a, b);
    assert!(a.file_name().unwrap().to_string_lossy().ends_with("-pre-delete-.db"));
}

#[test]
fn rotation_keeps_14_newest() {
    let dir = TempDir::new().unwrap();
    for i in 0..20 {
        std::fs::write(dir.path().join(format!("blades-202601{:02}-120000-daily.db", i + 1)), b"x").unwrap();
    }
    std::fs::write(dir.path().join("notes.txt"), b"keep me").unwrap();
    backup::rotate(dir.path(), backup::KEEP, "");
    let list = backup::list_backups(dir.path()).unwrap();
    assert_eq!(list.len(), 14);
    assert_eq!(list[0].name, "blades-20260120-120000-daily.db");
    assert_eq!(list[13].name, "blades-20260107-120000-daily.db");
    assert!(dir.path().join("notes.txt").exists());
}

#[test]
fn daily_backup_once_per_day() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    assert!(db.daily_backup().unwrap().is_some());
    assert!(db.daily_backup().unwrap().is_none());
    assert_eq!(db.list_backups().unwrap().len(), 1);
}

#[test]
fn save_get_roundtrip_and_upsert() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        let d = doc("a", "Sandr");
        store::save_character(c, &d, None)?;
        assert_eq!(store::get_character(c, "a")?, d); // byte-for-byte
        store::save_character(c, &doc("a", "Sandr 2"), None)?;
        let l = store::list_characters(c, false)?;
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name.as_deref(), Some("Sandr 2"));
        assert_eq!(l[0].playbook.as_deref(), Some("leech"));
        assert!(!l[0].archived);
        assert_eq!(l[0].alias, None);
        let aliased = json!({"id": "b", "name": "B", "alias": "Sandr", "playbookId": "leech", "schemaVersion": 1});
        store::save_character(c, &aliased.to_string(), None)?;
        let b = store::list_characters(c, false)?.into_iter().find(|r| r.id == "b").unwrap();
        assert_eq!(b.alias.as_deref(), Some("Sandr"));
        assert!(matches!(store::get_character(c, "zzz"), Err(DbError::NotFound(_))));
        // archive hides from the default list
        store::archive_character(c, "a", true)?;
        store::archive_character(c, "b", true)?;
        assert!(store::list_characters(c, false)?.is_empty());
        assert_eq!(store::list_characters(c, true)?.len(), 2);
        Ok(())
    })
    .unwrap();
}

#[test]
fn save_rejects_bad_docs_and_check_catches_mismatch() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        assert!(matches!(store::save_character(c, r#"{"name":"x"}"#, None), Err(DbError::Invalid(_))));
        assert!(matches!(store::save_character(c, r#"{"id":5}"#, None), Err(DbError::Invalid(_))));
        assert!(matches!(store::save_character(c, r#"{"id":""}"#, None), Err(DbError::Invalid(_))));
        assert!(matches!(store::save_character(c, "not json", None), Err(DbError::Json(_))));
        // the schema CHECK is the second line of defence: id column must equal doc.id
        let r = c.execute("INSERT INTO characters (id, doc) VALUES ('a', '{\"id\":\"b\"}')", []);
        assert!(r.is_err());
        assert_eq!(count(c, "characters"), 0);
        Ok(())
    })
    .unwrap();
}

#[test]
fn crash_mid_write_keeps_previous_doc() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| store::save_character(c, &doc("a", "before"), None).map(|_| ())).unwrap();
    db.with(|c| {
        let tx = c.unchecked_transaction()?;
        tx.execute("UPDATE characters SET doc = ?1 WHERE id = 'a'", [doc("a", "half-written")])?;
        drop(tx); // "crash": never committed
        Ok(())
    })
    .unwrap();
    db.with(|c| {
        assert_eq!(store::get_character(c, "a")?, doc("a", "before"));
        Ok(())
    })
    .unwrap();
    // and a real reopen of the file sees the same
    drop(db);
    let db = open(&dir);
    db.with(|c| {
        assert_eq!(store::get_character(c, "a")?, doc("a", "before"));
        Ok(())
    })
    .unwrap();
}

#[test]
fn revision_pruning_last_50_plus_newest_per_day() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        store::save_character(c, &doc("a", "A"), None)?;
        // 10 old days x 3 revisions, then 60 on a recent day
        for day in 1..=10 {
            for h in 0..3 {
                c.execute(
                    "INSERT INTO revisions (character_id, created_at, reason, doc) VALUES ('a', ?1, 'old', '{}')",
                    [format!("2026-01-{day:02}T{:02}:00:00.000Z", h + 10)],
                )?;
            }
        }
        for m in 0..60 {
            c.execute(
                "INSERT INTO revisions (character_id, created_at, reason, doc) VALUES ('a', ?1, 'new', '{}')",
                [format!("2026-02-01T10:{m:02}:00.000Z")],
            )?;
        }
        // another character's revisions are untouched
        store::save_character(c, &doc("b", "B"), None)?;
        for _ in 0..3 {
            c.execute("INSERT INTO revisions (character_id, reason, doc) VALUES ('b', 'x', '{}')", [])?;
        }
        store::save_revision(c, "a", "trigger")?; // 91 rows -> prune
        let revs = store::list_revisions(c, "a")?;
        // last 50 (49 "new" + trigger) + newest of each of the 10 old days + newest "new" is already in the 50
        assert_eq!(revs.len(), 50 + 10);
        // the kept old ones are the 3rd (newest) of each day
        let old: Vec<_> = revs.iter().filter(|r| r.reason == "old").collect();
        assert_eq!(old.len(), 10);
        assert!(old.iter().all(|r| r.created_at.contains("T12:")));
        assert_eq!(store::list_revisions(c, "b")?.len(), 3);
        // get_revision returns the snapshot
        let r = store::get_revision(c, revs[0].id)?;
        assert_eq!(r.doc, doc("a", "A"));
        assert!(matches!(store::save_revision(c, "nope", "x"), Err(DbError::NotFound(_))));
        Ok(())
    })
    .unwrap();
}

#[test]
fn delete_character_backs_up_and_cascades_revisions() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        store::save_character(c, &doc("a", "A"), None)?;
        store::save_revision(c, "a", "t")?;
        store::delete_character(c, db.backup_dir(), "a")?;
        assert_eq!(count(c, "characters"), 0);
        assert_eq!(count(c, "revisions"), 0);
        Ok(())
    })
    .unwrap();
    let list = db.list_backups().unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].name.contains("pre-delete"));
    let b = Connection::open(db.backup_dir().join(&list[0].name)).unwrap();
    assert_eq!(count(&b, "characters"), 1); // the backup still has the sheet
}

#[test]
fn leaving_a_campaign_copies_its_rules_into_the_sheet() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        store::save_campaign(c, r#"{"id":"k","name":"Iruvia","rules":{"mode":"custom","dayCounter":true}}"#)?;
        store::save_campaign(c, r#"{"id":"k2","name":"Other","rules":{"mode":"book"}}"#)?;
        let a = json!({"id":"a","name":"A","rulesOverride":{"dayCounter":false}}).to_string();
        store::save_character(c, &a, Some("k"))?;
        store::set_character_campaign(c, "a", Some("k"))?; // same campaign: nothing copied
        let d: Value = serde_json::from_str(&store::get_character(c, "a")?)?;
        assert!(d["rulesOverride"].get("mode").is_none());
        store::set_character_campaign(c, "a", None)?;
        let d: Value = serde_json::from_str(&store::get_character(c, "a")?)?;
        assert_eq!(d["rulesOverride"]["mode"], "custom");
        assert_eq!(d["rulesOverride"]["dayCounter"], false); // the sheet's own group wins
        assert!(store::list_characters(c, true)?[0].campaign_id.is_none());
        store::set_character_campaign(c, "a", Some("k2"))?; // joining: override kept as is
        let d: Value = serde_json::from_str(&store::get_character(c, "a")?)?;
        assert_eq!(d["rulesOverride"]["mode"], "custom");
        assert!(matches!(store::set_character_campaign(c, "zzz", None), Err(DbError::NotFound(_))));
        Ok(())
    })
    .unwrap();
}

#[test]
fn delete_campaign_copies_rules_into_sheets() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        store::save_campaign(c, r#"{"id":"k","name":"Iruvia","rules":{"mode":"custom","stress":{"book":false,"boxes":12},"dayCounter":true}}"#)?;
        store::save_character(c, &doc("a", "A"), Some("k"))?;
        // b has its own override of one group: it must win
        let b = json!({"id":"b","name":"B","rulesOverride":{"stress":{"book":true,"boxes":9}}}).to_string();
        store::save_character(c, &b, Some("k"))?;
        store::save_character(c, &doc("free", "Free"), None)?;
        store::add_ruling(c, r#"{"id":"r1","campaignId":"k","date":"2026-11-14","author":"GM","quote":"verbatim","topic":null}"#)?;
        assert_eq!(store::list_rulings(c, "k")?.len(), 1);

        store::delete_campaign(c, db.backup_dir(), "k")?;

        let a: Value = serde_json::from_str(&store::get_character(c, "a")?)?;
        assert_eq!(a["rulesOverride"]["stress"]["boxes"], 12);
        assert_eq!(a["rulesOverride"]["dayCounter"], true);
        assert_eq!(a["name"], "A");
        let b: Value = serde_json::from_str(&store::get_character(c, "b")?)?;
        assert_eq!(b["rulesOverride"]["stress"]["boxes"], 9);
        assert_eq!(b["rulesOverride"]["mode"], "custom");
        let free: Value = serde_json::from_str(&store::get_character(c, "free")?)?;
        assert!(free.get("rulesOverride").is_none());
        let rows = store::list_characters(c, true)?;
        assert!(rows.iter().all(|r| r.campaign_id.is_none()));
        assert_eq!(count(c, "campaigns"), 0);
        assert!(matches!(store::delete_campaign(c, db.backup_dir(), "k"), Err(DbError::NotFound(_))));
        Ok(())
    })
    .unwrap();
    assert!(db.list_backups().unwrap().iter().any(|b| b.name.contains("pre-delete")));
}

#[test]
fn rulings_settings_and_campaign_validation() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| {
        assert!(store::save_campaign(c, r#"{"id":"k","name":"","rules":{}}"#).is_err());
        assert!(store::save_campaign(c, r#"{"id":"k","name":"n"}"#).is_err());
        store::save_campaign(c, r#"{"id":"k","name":"n","rules":{"mode":"book"}}"#)?;
        assert_eq!(store::list_campaigns(c)?[0].rules["mode"], "book");
        assert!(store::add_ruling(c, r#"{"id":"r","campaignId":"k","date":"2026-01-01","author":"GM","quote":""}"#).is_err());
        assert!(store::add_ruling(c, r#"{"id":"r","campaignId":"nope","date":"2026-01-01","author":"GM","quote":"q"}"#).is_err()); // FK
        assert_eq!(store::get_setting(c, "theme")?, None);
        store::set_setting(c, "theme", r#""dark""#)?;
        store::set_setting(c, "theme", r#""light""#)?;
        assert_eq!(store::get_setting(c, "theme")?.as_deref(), Some(r#""light""#));
        assert!(store::set_setting(c, "x", "{bad").is_err());
        Ok(())
    })
    .unwrap();
}

#[test]
fn restore_replaces_content_and_makes_pre_restore_backup() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| store::save_character(c, &doc("a", "A"), None).map(|_| ())).unwrap();
    let snap = db.backup("manual").unwrap().file_name().unwrap().to_string_lossy().into_owned();
    db.with(|c| {
        store::save_character(c, &doc("b", "B"), None)?;
        store::save_character(c, &doc("a", "A changed"), None).map(|_| ())
    })
    .unwrap();

    let pre = db.restore(&snap).unwrap();
    assert!(pre.file_name().unwrap().to_string_lossy().contains("pre-restore"));
    db.with(|c| {
        let l = store::list_characters(c, true)?;
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name.as_deref(), Some("A"));
        // connection is live and writable after the swap
        store::save_character(c, &doc("c", "C"), None)?;
        Ok(())
    })
    .unwrap();
    // pre-restore backup holds the state before restoring
    let p = Connection::open(&pre).unwrap();
    assert_eq!(count(&p, "characters"), 2);
    assert!(!dir.path().join("blades.db.restoring").exists());
}

#[test]
fn restore_rejects_garbage_and_newer_and_keeps_live_db() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| store::save_character(c, &doc("a", "A"), None).map(|_| ())).unwrap();
    let bdir = dir.path().join("backups");
    std::fs::create_dir_all(&bdir).unwrap();

    std::fs::write(bdir.join("blades-20200101-000000-junk.db"), b"this is not sqlite at all, really not").unwrap();
    assert!(db.restore("blades-20200101-000000-junk.db").is_err());

    {
        let c = Connection::open(bdir.join("blades-20200102-000000-newer.db")).unwrap();
        c.execute_batch("CREATE TABLE t(x); PRAGMA user_version = 99;").unwrap();
    }
    assert!(matches!(db.restore("blades-20200102-000000-newer.db"), Err(DbError::TooNew { .. })));

    {
        let c = Connection::open(bdir.join("blades-20200103-000000-nochar.db")).unwrap();
        c.execute_batch("CREATE TABLE t(x); PRAGMA user_version = 1;").unwrap();
    }
    assert!(matches!(db.restore("blades-20200103-000000-nochar.db"), Err(DbError::Invalid(_))));

    db.with(|c| {
        assert_eq!(store::list_characters(c, true)?.len(), 1);
        store::save_character(c, &doc("b", "B"), None)?; // still the real file, writable
        Ok(())
    })
    .unwrap();
    assert!(!dir.path().join("blades.db.restoring").exists());
}

#[test]
fn restore_accepts_only_backup_names() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    let snap = db.backup("manual").unwrap();
    let outside = dir.path().join("blades-20200101-000000-x.db");
    std::fs::copy(&snap, &outside).unwrap();
    let abs = snap.to_string_lossy().into_owned();
    for bad in [
        abs.as_str(),
        r"..\blades-20200101-000000-x.db",
        "../blades-20200101-000000-x.db",
        "sub/blades-20200101-000000-x.db",
        "blades.db",
        "blades-20200101-000000-x.db", // well-formed but not in the backups folder
    ] {
        assert!(db.restore(bad).is_err(), "{bad}");
    }
    assert!(matches!(db.restore("blades-20200101-000000-x.db"), Err(DbError::NotFound(_))));
}

#[test]
fn restoring_the_oldest_of_14_backups_works() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| store::save_character(c, &doc("a", "A"), None).map(|_| ())).unwrap();
    let snap = db.backup("manual").unwrap();
    let bdir = dir.path().join("backups");
    for d in 1..=14 {
        std::fs::copy(&snap, bdir.join(format!("blades-202001{d:02}-120000-daily.db"))).unwrap();
    }
    std::fs::remove_file(&snap).unwrap();
    db.with(|c| store::save_character(c, &doc("b", "B"), None).map(|_| ())).unwrap();
    let oldest = backup::list_backups(&bdir).unwrap().pop().unwrap().name;
    assert_eq!(backup::list_backups(&bdir).unwrap().len(), 14);

    db.restore(&oldest).unwrap(); // the pre-restore backup rotates the oldest file out; the restore must not care
    assert!(!bdir.join(&oldest).exists());
    db.with(|c| {
        assert_eq!(store::list_characters(c, true)?.len(), 1);
        Ok(())
    })
    .unwrap();
}

#[test]
fn failed_swap_keeps_original_and_stays_usable() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| store::save_character(c, &doc("a", "A"), None).map(|_| ())).unwrap();
    let snap = db.backup("manual").unwrap();
    db.with(|c| store::save_character(c, &doc("b", "B"), None).map(|_| ())).unwrap();
    let name = snap.file_name().unwrap().to_string_lossy().into_owned();

    let r = db.restore_with(&name, |_, _| Err(std::io::Error::other("locked")));
    assert!(matches!(r, Err(DbError::Io(_))));
    db.with(|c| {
        assert_eq!(store::list_characters(c, true)?.len(), 2); // untouched
        Ok(())
    })
    .unwrap();
    assert!(!dir.path().join("blades.db.restoring").exists());
}

#[test]
fn unavailable_slot_reports_it() {
    let dir = TempDir::new().unwrap();
    let db = Db::unavailable(dir.path().join("blades.db"), dir.path().join("backups"));
    let e = db.with(|c| store::list_characters(c, true)).unwrap_err();
    assert!(matches!(e, DbError::Unavailable));
    assert!(db.restore("blades-20200101-000000-x.db").is_err());
    let j = serde_json::to_value(&e).unwrap();
    assert_eq!(j["kind"], "Unavailable");
}

#[test]
fn rotation_failure_does_not_fail_backup() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    let bdir = dir.path().join("backups");
    // 20 old "files"; the oldest is a non-empty directory, so remove_file on it fails
    for i in 1..=20 {
        let p = bdir.join(format!("blades-202001{i:02}-120000-daily.db"));
        if i == 1 {
            std::fs::create_dir_all(p.join("x")).unwrap();
        } else {
            std::fs::write(&p, b"x").unwrap();
        }
    }
    let new = db.backup("manual").unwrap();
    assert!(new.exists());
}

#[test]
fn rotation_keeps_newest_of_each_recent_day_and_the_new_one() {
    let dir = TempDir::new().unwrap();
    // 14 days of dailies, then 20 manual backups on the last day
    for d in 1..=14 {
        std::fs::write(dir.path().join(format!("blades-202601{d:02}-090000-daily.db")), b"x").unwrap();
    }
    for h in 0..20 {
        std::fs::write(dir.path().join(format!("blades-20260114-{:02}0000-manual.db", h + 10)), b"x").unwrap();
    }
    backup::rotate(dir.path(), backup::KEEP, "blades-20260114-100000-manual.db");
    let names: Vec<_> = backup::list_backups(dir.path()).unwrap().into_iter().map(|b| b.name).collect();
    for d in 1..=13 {
        assert!(names.contains(&format!("blades-202601{d:02}-090000-daily.db")), "daily {d} lost");
    }
    assert!(names.contains(&"blades-20260114-100000-manual.db".to_string())); // the one just made
    assert!(names.contains(&"blades-20260114-290000-manual.db".to_string())); // newest
    assert!(!names.contains(&"blades-20260114-110000-manual.db".to_string()));
}

#[test]
fn tmp_files_are_ignored() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("blades-20260101-120000-x.db.tmp"), b"half").unwrap();
    assert!(backup::list_backups(dir.path()).unwrap().is_empty());
    backup::rotate(dir.path(), 0, "");
    assert!(dir.path().join("blades-20260101-120000-x.db.tmp").exists());
}

fn with_rulebook(db: &Db) {
    let pages = vec![crate::rulebook::ImportPage { pdf: 10, book: 5, text: "Испытания ослабляют последствия.".into() }];
    db.with(|c| crate::rulebook::import_pages(c, db.backup_dir(), "T", "ru", &pages, &[]).map(|_| ())).unwrap();
}

#[test]
fn backup_has_no_rulebook_but_keeps_characters() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| store::save_character(c, &doc("a", "A"), None).map(|_| ())).unwrap();
    with_rulebook(&db);
    let b = Connection::open(db.backup("manual").unwrap()).unwrap();
    for t in ["rulebooks", "rb_pages", "rb_toc", "bookmarks"] {
        assert_eq!(count(&b, t), 0, "{t}");
    }
    assert_eq!(count(&b, "characters"), 1);
    // and no stray text left in the file
    let bytes = std::fs::read(db.backup_dir().join(db.list_backups().unwrap()[0].name.clone())).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("Испытания"));
}

#[test]
fn restore_keeps_current_rulebook_and_search() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    db.with(|c| store::save_character(c, &doc("a", "A"), None).map(|_| ())).unwrap();
    let snap = db.backup("manual").unwrap().file_name().unwrap().to_string_lossy().into_owned();
    with_rulebook(&db); // imported after the backup was made
    db.restore(&snap).unwrap();
    db.with(|c| {
        assert_eq!(count(c, "rb_pages"), 1);
        assert_eq!(crate::rulebook::search(c, "испытание", 5)?.len(), 1);
        Ok(())
    })
    .unwrap();
}

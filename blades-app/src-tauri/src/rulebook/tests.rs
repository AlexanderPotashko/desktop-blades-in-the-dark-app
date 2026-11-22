use super::*;
use crate::db::Db;
use tempfile::TempDir;

fn open(dir: &TempDir) -> Db {
    Db::open(dir.path().join("blades.db"), dir.path().join("backups")).unwrap()
}

fn pg(pdf: i64, text: &str) -> ImportPage {
    ImportPage { pdf, book: pdf - 5, text: text.into() }
}

fn import(db: &Db, title: &str, pages: &[ImportPage]) -> Result<RulebookInfo> {
    db.with(|c| import_pages(c, db.backup_dir(), title, "ru", pages, &[]))
}

fn found(db: &Db, q: &str) -> Vec<i64> {
    db.with(|c| search(c, q, 50)).unwrap().iter().map(|h| h.pdf).collect()
}

fn sample() -> Vec<ImportPage> {
    vec![
        pg(10, "Испытания ослабляют последствия. Игрок бросает кубики."),
        pg(11, "Ёжик нашёл ключ от сундука."),
        pg(12, "Ничего про это здесь нет."),
    ]
}

#[test]
fn inflected_forms_and_yo() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    import(&db, "R", &sample()).unwrap();
    assert_eq!(found(&db, "испытание"), vec![10]); // query «испытание», page «испытания»
    assert_eq!(found(&db, "ИСПЫТАНИЯМИ!"), vec![10]);
    assert_eq!(found(&db, "ежик нашел"), vec![11]); // ё -> е on both sides
    assert_eq!(found(&db, "ключ кубики"), Vec::<i64>::new()); // AND: no page has both
}

#[test]
fn prefix_fallback_only_when_stems_miss() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    import(&db, "R", &sample()).unwrap();
    assert_eq!(found(&db, "ослаб"), vec![10]); // not a whole stem, found as prefix
    assert!(found(&db, "зябликов").is_empty());
    assert!(found(&db, "  ,, ").is_empty());
}

#[test]
fn bm25_orders_by_relevance() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    let long = format!("Алхимия {}", "слово ".repeat(200));
    import(&db, "R", &[pg(1, &long), pg(2, "Алхимия, алхимик и ещё алхимия."), pg(3, "Алхимия упомянута один раз, коротко.")]).unwrap();
    assert_eq!(found(&db, "алхимия"), vec![2, 3, 1]);
}

#[test]
fn snippet_highlights_original_words() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    import(&db, "R", &sample()).unwrap();
    let hits = db.with(|c| search(c, "испытание", 5)).unwrap();
    let marked: Vec<&str> = hits[0].snippet.iter().filter(|s| s.hit).map(|s| s.text.as_str()).collect();
    assert_eq!(marked, vec!["Испытания"]); // original casing and form
    let all: String = hits[0].snippet.iter().map(|s| s.text.as_str()).collect();
    assert_eq!(all, sample()[0].text);
    assert_eq!((hits[0].pdf, hits[0].book), (10, 5));
}

#[test]
fn snippet_is_cut_with_ellipses() {
    let st = Stemmers::new();
    let text = format!("{} цель {}", "аб ".repeat(100), "вг ".repeat(100));
    let segs = st.snippet(&text, &["цел".to_string()], false);
    assert!(segs.first().unwrap().text.starts_with('…') && segs.last().unwrap().text.ends_with('…'));
    assert!(segs.iter().any(|s| s.hit && s.text == "цель"));
    assert!(segs.iter().map(|s| s.text.chars().count()).sum::<usize>() < 260);
}

#[test]
fn failed_import_keeps_previous_rulebook() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    import(&db, "R", &sample()).unwrap();
    db.with(|c| add_bookmark(c, 5, "x")).unwrap();
    // second page repeats pdf 10: UNIQUE fails after the first insert, mid-import
    let err = import(&db, "R", &[pg(10, "Новая книга"), pg(10, "дубль")]).unwrap_err();
    assert_eq!(err.kind(), "Db");
    assert_eq!(found(&db, "испытание"), vec![10]);
    assert!(found(&db, "новая").is_empty());
    let rb = db.with(list).unwrap();
    assert_eq!((rb.len(), rb[0].pages), (1, 3));
    assert_eq!(db.with(list_bookmarks).unwrap().len(), 1);
    // FTS has no leftovers either
    assert_eq!(db.with(|c| Ok(c.query_row("SELECT count(*) FROM rb_fts_docsize", [], |r| r.get::<_, i64>(0))?)).unwrap(), 3);
}

#[test]
fn reimport_replaces_after_backup_and_keeps_bookmarks() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    import(&db, "R", &sample()).unwrap();
    db.with(|c| add_bookmark(c, 5, "Испытания")).unwrap();
    assert!(db.list_backups().unwrap().is_empty()); // first import: nothing to protect
    import(&db, "R", &[pg(10, "Совсем другой текст")]).unwrap();
    assert_eq!(db.list_backups().unwrap().len(), 1);
    assert!(found(&db, "испытание").is_empty());
    assert_eq!(found(&db, "текст"), vec![10]);
    let bm = db.with(list_bookmarks).unwrap();
    assert_eq!((bm.len(), bm[0].page, bm[0].title.as_str()), (1, 5, "Испытания"));
    assert_eq!(db.with(list).unwrap().len(), 1);
}

#[test]
fn rejects_bad_input() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    assert!(import(&db, " ", &sample()).is_err());
    assert!(import(&db, "R", &[]).is_err());
    assert!(db.with(|c| import_pages(c, db.backup_dir(), "R", "de", &sample(), &[])).is_err());
}

#[test]
fn delete_cascades_fts_toc_bookmarks() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    let toc = [TocEntry { title: "Глава".into(), page: 5, level: 1 }];
    let info = db.with(|c| import_pages(c, db.backup_dir(), "R", "ru", &sample(), &toc)).unwrap();
    db.with(|c| add_bookmark(c, 5, "")).unwrap();
    assert_eq!(db.with(toc_of).unwrap().len(), 1);
    db.with(|c| delete(c, &info.id)).unwrap();
    for t in ["rb_pages", "rb_toc", "bookmarks", "rb_fts_docsize"] {
        let n = db.with(|c| Ok(c.query_row(&format!("SELECT count(*) FROM {t}"), [], |r| r.get::<_, i64>(0))?)).unwrap();
        assert_eq!(n, 0, "{t}");
    }
    assert!(db.with(|c| delete(c, &info.id)).is_err());
    assert!(found(&db, "испытание").is_empty());
}

fn toc_of(c: &Connection) -> Result<Vec<TocEntry>> {
    toc(c)
}

#[test]
fn page_lookup_by_pdf_and_book() {
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    import(&db, "R", &sample()).unwrap();
    assert_eq!(db.with(|c| page(c, 11, false)).unwrap().book, 6);
    assert_eq!(db.with(|c| page(c, 6, true)).unwrap().pdf, 11);
    assert_eq!(db.with(|c| page(c, 99, false)).unwrap_err().kind(), "NotFound");
}

/// Whole-book search on the user's private rulebook.txt (skipped when absent; its text is never copied anywhere).
#[test]
fn perf_real_rulebook() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../rulebook.txt");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        eprintln!("rulebook.txt not found, perf test skipped");
        return;
    };
    let mut pages = vec![];
    for part in raw.split("=====PAGE ").skip(1) {
        let Some((n, text)) = part.split_once("=====") else { continue };
        let pdf: i64 = n.trim().parse().unwrap();
        pages.push(ImportPage { pdf, book: pdf - 5, text: text.trim().to_string() });
    }
    assert!(pages.len() > 300, "unexpected page count {}", pages.len());
    let dir = TempDir::new().unwrap();
    let db = open(&dir);
    let t = std::time::Instant::now();
    import(&db, "perf", &pages).unwrap();
    eprintln!("import of {} pages: {:?}", pages.len(), t.elapsed());
    for q in ["испытание", "стресс", "особое усилие", "осложнения последствия", "ослаб", "умелец"] {
        let t = std::time::Instant::now();
        let n = db.with(|c| search(c, q, 50)).unwrap().len();
        let el = t.elapsed();
        eprintln!("search {q:?}: {n} hits in {el:?}");
        assert!(n > 0, "{q}");
        assert!(el.as_millis() < 50, "{q} took {el:?}");
    }
}

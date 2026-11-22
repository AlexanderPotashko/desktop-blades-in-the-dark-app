mod db;
mod rulebook;

use db::{commands, Db};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let backups = app.path().document_dir()?.join("Blades").join("backups");
            // Fails with a clear message if the database is newer than this app: nothing is touched then.
            let db = match Db::open(data.join("blades.db"), backups.clone()) {
                Ok(db) => {
                    if let Err(e) = db.daily_backup() {
                        eprintln!("daily backup failed: {e}");
                    }
                    db
                }
                Err(e) => {
                    // Tell the user, then exit; until then every command answers "unavailable".
                    let handle = app.handle().clone();
                    app.dialog()
                        .message(e.to_string())
                        .title("Blades")
                        .kind(MessageDialogKind::Error)
                        .show(move |_| handle.exit(1));
                    Db::unavailable(data.join("blades.db"), backups)
                }
            };
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_characters,
            commands::get_character,
            commands::save_character,
            commands::set_character_campaign,
            commands::archive_character,
            commands::delete_character,
            commands::save_revision,
            commands::list_revisions,
            commands::get_revision,
            commands::list_campaigns,
            commands::save_campaign,
            commands::delete_campaign,
            commands::add_ruling,
            commands::list_rulings,
            commands::get_setting,
            commands::set_setting,
            commands::backup_now,
            commands::list_backups,
            commands::restore_backup,
            rulebook::commands::rb_pick_source,
            rulebook::commands::rb_import_pages,
            rulebook::commands::rb_search,
            rulebook::commands::rb_page,
            rulebook::commands::rb_page_by_book,
            rulebook::commands::rb_toc,
            rulebook::commands::rb_list,
            rulebook::commands::rb_delete,
            rulebook::commands::rb_add_bookmark,
            rulebook::commands::rb_list_bookmarks,
            rulebook::commands::rb_delete_bookmark,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blades");
}

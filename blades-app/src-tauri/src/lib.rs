mod db;

use db::{commands, Db};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let backups = app.path().document_dir()?.join("Blades").join("backups");
            // Fails with a clear message if the database is newer than this app: nothing is touched then.
            let db = Db::open(data.join("blades.db"), backups)?;
            if let Err(e) = db.daily_backup() {
                eprintln!("daily backup failed: {e}");
            }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blades");
}

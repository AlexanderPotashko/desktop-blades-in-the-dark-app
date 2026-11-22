// Declaring the app commands makes Tauri generate `allow-<command>` permissions, so capabilities can list them explicitly.
// Keep in sync with generate_handler! in src/lib.rs and capabilities/default.json.
const COMMANDS: &[&str] = &[
    "list_characters",
    "get_character",
    "save_character",
    "set_character_campaign",
    "archive_character",
    "delete_character",
    "save_revision",
    "list_revisions",
    "get_revision",
    "list_campaigns",
    "save_campaign",
    "delete_campaign",
    "add_ruling",
    "list_rulings",
    "get_setting",
    "set_setting",
    "backup_now",
    "list_backups",
    "restore_backup",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}

# Blades in the Dark — desktop app (work in progress)

- `blades-app/PLAN.md` — development plan for a desktop character-sheet app covering all playbooks (Tauri 2 + SQLite, macOS and Windows).
- `charsheet.html` — prototype of the interactive sheet (open in a browser; data in localStorage, JSON export/import). UI is in Russian.
- `tools/mkrulebook.py` — builds `rulebook.js` for the sheet's Rulebook tab from your own rulebook text.

The rulebook text is not included here and will not ship with the desktop app either (copyright: Studio 101 / One Seven Design).
To enable the Rulebook tab, put your own `rulebook.txt` next to the sheet and run `python tools/mkrulebook.py rulebook.txt rulebook.js`.

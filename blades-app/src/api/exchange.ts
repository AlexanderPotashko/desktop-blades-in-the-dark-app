// Save / open dialogs for `.blades.json` files. In the app both run Rust-side (src-tauri/src/exchange.rs: no fs plugin,
// no path ever reaches the window). Plain browsers (dev, screenshots) fall back to a download and a file input.
import { inTauri, invoke } from './db';

/** Saves `json` through the native "save as" dialog. false = the user cancelled. */
export async function saveExport(defaultName: string, json: string): Promise<boolean> {
  if (inTauri()) return invoke<boolean>('export_save', { defaultName, json });
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Text of the file the user picks; null = cancelled. */
export async function pickImport(): Promise<string | null> {
  if (inTauri()) {
    const buf = await invoke<ArrayBuffer>('import_open');
    return buf.byteLength ? new TextDecoder().decode(buf) : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ? input.files[0].text() : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

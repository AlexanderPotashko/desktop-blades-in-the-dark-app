// Which character is open: start-up (last opened, else any, else a sample Leech), create, import from the prototype.
import * as db from '../api/db';
import { importPrototype } from '../engine/importPrototype';
import { Character, type TableRules } from '../model';
import { t } from '../i18n';
import { newCharacter } from './actions';
import { useStore } from './store';
import { useUi } from './ui';

async function open(doc: Character, campaignId?: string | null) {
  await useStore.getState().flush('switch');
  const rules = campaignId ? (await db.listCampaigns()).find((c) => c.id === campaignId)?.rules : undefined;
  await db.saveCharacter(doc);
  useStore.getState().open(doc, { rules, campaignId: campaignId ?? undefined });
  useUi.getState().set({ lastCharacter: doc.id });
}

/** Load settings, then the last opened sheet; first run creates a sample character from the Leech playbook. */
export async function boot(): Promise<void> {
  await useUi.getState().load();
  const rows = await db.listCharacters();
  const row = rows.find((r) => r.id === useUi.getState().lastCharacter) ?? rows[0];
  if (row) {
    try {
      const doc = await db.getCharacter(row.id);
      const rules = row.campaignId ? (await db.listCampaigns()).find((c) => c.id === row.campaignId)?.rules : undefined;
      useStore.getState().open(doc, { rules, campaignId: row.campaignId ?? undefined });
      return;
    } catch (e) {
      console.error('could not open the last character, starting a new one', e);
    }
  }
  await open(newCharacter('leech', { withBuild: true, name: t('sample.name') }));
}

export const createCharacter = (playbookId: string) => open(newCharacter(playbookId));

/** Reads a charsheet.html JSON export and opens it; the prototype's table rules become the sheet's own. Returns warnings. */
export async function importFromPrototype(text: string): Promise<string[]> {
  const r = importPrototype(JSON.parse(text));
  const doc = Character.parse({ ...r.character, rulesOverride: r.rules satisfies TableRules }); // fails here, not at the first save
  await open(doc);
  return r.warnings;
}

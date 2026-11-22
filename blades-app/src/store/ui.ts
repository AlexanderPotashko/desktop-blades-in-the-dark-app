// App-level UI state (not part of a character): language, hover tips, current tab. Persisted as the `ui` setting.
import { create } from 'zustand';
import * as db from '../api/db';
import { detectLang, setLang, type Lang } from '../i18n';

export const TABS = ['sheet', 'gear', 'workshop', 'notes', 'rules', 'background', 'rulebook'] as const;
export type Tab = (typeof TABS)[number] | 'settings';

interface Ui { lang: Lang; tips: boolean; tab: Tab; lastCharacter?: string }
interface UiStore extends Ui {
  set: (p: Partial<Ui>) => void;
  /** Restores the saved settings (call once at start). */
  load: () => Promise<void>;
}

const initial: Ui = { lang: detectLang(), tips: false, tab: 'sheet' };

export const useUi = create<UiStore>()((set, get) => ({
  ...initial,
  set(p) {
    if (p.lang) setLang(p.lang);
    set(p);
    const { lang, tips, lastCharacter } = get();
    // tab is a per-run thing; the rest survives restarts
    db.setSetting('ui', { lang, tips, lastCharacter }).catch((e) => console.error('ui settings not saved', e));
  },
  async load() {
    const saved = await db.getSetting<Partial<Ui>>('ui').catch(() => undefined);
    if (saved?.lang) setLang(saved.lang);
    set({ ...saved });
  },
}));

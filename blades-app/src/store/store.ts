// Store of the open character: edits through Immer `produceWithPatches` (patches feed undo/redo),
// autosave after 800 ms of quiet, a revision every 10 minutes of edits and on close (PLAN.md, save flow).
import { create } from 'zustand';
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { BOOK_RULES, type Character, type TableRules } from '../model';
import { effectiveRules, resolveRules } from '../engine/rules';
import * as db from '../api/db';

enablePatches();

export const SAVE_DELAY = 800;
export const REVISION_EVERY = 10 * 60 * 1000;
const MERGE_WINDOW = 1500; // consecutive edits of one field (typing) are one undo step
const MAX_UNDO = 200;

interface Entry { patches: Patch[]; inverse: Patch[]; key?: string; at: number }
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface State {
  doc: Character | null;
  /** Campaign rules (book rules for a lone sheet); the sheet's `rulesOverride` goes on top. */
  baseRules: TableRules;
  campaignId?: string;
  past: Entry[];
  future: Entry[];
  saveState: SaveState;
  open: (doc: Character, opts?: { rules?: TableRules; campaignId?: string }) => void;
  /** `key` merges consecutive edits of one field into one undo step. */
  edit: (recipe: (d: Draft<Character>) => void, key?: string) => void;
  undo: () => void;
  redo: () => void;
  /** Saves now (pending timer included) and, if there were edits since the last revision, a revision. */
  flush: (revisionReason?: string) => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastRevisionAt = 0;
let editsSinceRevision = false;
let saving: Promise<void> = Promise.resolve();

export const useStore = create<State>()((set, get) => {
  const commit = (doc: Character) => {
    set({ doc, saveState: 'dirty' });
    editsSinceRevision = true;
    clearTimeout(timer);
    timer = setTimeout(() => void save(), SAVE_DELAY);
  };
  const save = (revisionReason?: string): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    // serialized: a save never overtakes the previous one
    saving = saving.then(async () => {
      const { doc, saveState, campaignId } = get();
      if (!doc) return;
      try {
        if (saveState !== 'saved') {
          set({ saveState: 'saving' });
          await db.saveCharacter(doc, campaignId);
          // an edit during the await re-armed the timer and set 'dirty'; keep that
          if (get().doc === doc) set({ saveState: 'saved' });
        }
        const due = Date.now() - lastRevisionAt >= REVISION_EVERY;
        if (editsSinceRevision && (revisionReason || due)) {
          await db.saveRevision(doc.id, revisionReason ?? 'autosave');
          lastRevisionAt = Date.now();
          editsSinceRevision = false;
        }
      } catch (e) {
        console.error('save failed', e);
        set({ saveState: 'error' });
      }
    });
    return saving;
  };
  const step = (from: 'past' | 'future') => {
    const { doc } = get();
    const stack = get()[from];
    const e = stack.at(-1);
    if (!doc || !e) return;
    const undoing = from === 'past';
    const next = applyPatches(doc, undoing ? e.inverse : e.patches);
    set(undoing ? { past: stack.slice(0, -1), future: [...get().future, e] } : { future: stack.slice(0, -1), past: [...get().past, e] });
    commit(next);
  };

  return {
    doc: null,
    baseRules: BOOK_RULES,
    past: [],
    future: [],
    saveState: 'saved',
    open(doc, opts = {}) {
      clearTimeout(timer);
      lastRevisionAt = Date.now();
      editsSinceRevision = false;
      set({ doc, baseRules: opts.rules ?? BOOK_RULES, campaignId: opts.campaignId, past: [], future: [], saveState: 'saved' });
    },
    edit(recipe, key) {
      const { doc, past } = get();
      if (!doc) return;
      const [next, patches, inverse] = produceWithPatches(doc, recipe);
      if (!patches.length) return;
      const at = Date.now();
      const last = past.at(-1);
      const merge = key !== undefined && last?.key === key && at - last.at < MERGE_WINDOW;
      const entry: Entry = merge ? { patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], key, at } : { patches, inverse, key, at };
      set({ past: [...(merge ? past.slice(0, -1) : past), entry].slice(-MAX_UNDO), future: [] });
      commit(next);
    },
    undo: () => step('past'),
    redo: () => step('future'),
    flush: (reason) => save(reason),
  };
});

/** Rules in force for the open sheet: campaign rules + sheet override, with "by the book" forcing the official ones. */
export function useRules(): TableRules {
  const base = useStore((s) => s.baseRules);
  const over = useStore((s) => s.doc?.rulesOverride);
  return effectiveRules(resolveRules(base, over));
}
/** Raw rules (custom values kept even while the mode is "book"): what the settings panel edits. */
export function useRawRules(): TableRules {
  const base = useStore((s) => s.baseRules);
  const over = useStore((s) => s.doc?.rulesOverride);
  return resolveRules(base, over);
}

/** Ctrl/Cmd+Z undo, Ctrl+Y or Ctrl/Cmd+Shift+Z redo. Returns the unsubscribe. */
export function installShortcuts(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const on = (e: Event) => {
    const k = e as KeyboardEvent;
    if (!(k.ctrlKey || k.metaKey) || k.altKey) return;
    const key = k.key.toLowerCase();
    const redo = key === 'y' || (key === 'z' && k.shiftKey);
    if (key !== 'z' && !redo) return;
    k.preventDefault();
    useStore.getState()[redo ? 'redo' : 'undo']();
  };
  target.addEventListener('keydown', on);
  return () => target.removeEventListener('keydown', on);
}

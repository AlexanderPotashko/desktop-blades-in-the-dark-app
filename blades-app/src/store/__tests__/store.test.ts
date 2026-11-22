import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const saveCharacter = vi.fn(async (_doc?: unknown, _campaign?: string) => 'id');
const saveRevision = vi.fn(async (_id?: string, _reason?: string) => 1);
vi.mock('../../api/db', () => ({ saveCharacter, saveRevision }));

const { useStore, installShortcuts, SAVE_DELAY, REVISION_EVERY } = await import('../store');
const { newCharacter, setAction, setStress, setField, addTalent } = await import('../actions');
const { BOOK_RULES } = await import('../../model');
const get = () => useStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  saveCharacter.mockClear();
  saveRevision.mockClear();
  get().open(newCharacter('leech'));
});
afterEach(() => vi.useRealTimers());

describe('undo / redo', () => {
  it('undoes and redoes edits, a new edit clears redo', () => {
    setAction('hunt', 2);
    setStress(3);
    expect(get().doc!.actions.hunt).toBe(2);
    get().undo();
    expect(get().doc!.stress).toBe(0);
    expect(get().doc!.actions.hunt).toBe(2);
    get().undo();
    expect(get().doc!.actions.hunt).toBe(0);
    get().redo();
    expect(get().doc!.actions.hunt).toBe(2);
    setStress(1);
    expect(get().future).toHaveLength(0);
    get().redo(); // nothing to redo
    expect(get().doc!.stress).toBe(1);
  });

  it('typing in one field is one undo step', () => {
    for (const v of ['A', 'Al', 'Ali']) setField('name', v);
    expect(get().past).toHaveLength(1);
    get().undo();
    expect(get().doc!.name).toBe('');
  });

  it('an edit that changes nothing is not a step', () => {
    setStress(0);
    expect(get().past).toHaveLength(0);
    expect(get().saveState).toBe('saved');
  });

  it('taking a talent with a preset adds its counter once; undo takes both back', () => {
    addTalent('analyst', BOOK_RULES);
    expect(get().doc!.counters.map((c) => c.fromTalent)).toEqual(['analyst']);
    get().undo();
    expect(get().doc!.counters).toHaveLength(0);
    expect(get().doc!.talents).toHaveLength(0);
  });

  it('Ctrl+Z, Cmd+Z, Ctrl+Y, Ctrl+Shift+Z', () => {
    const handlers: Array<(e: Event) => void> = [];
    const off = installShortcuts({ addEventListener: (_t: string, h: never) => void handlers.push(h), removeEventListener: () => {} } as never);
    const key = (k: Partial<KeyboardEvent>) => handlers[0]({ preventDefault() {}, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, key: 'z', ...k } as unknown as Event);
    setStress(2);
    key({ metaKey: true });
    expect(get().doc!.stress).toBe(0);
    key({ ctrlKey: true, key: 'y' });
    expect(get().doc!.stress).toBe(2);
    key({ ctrlKey: true });
    key({ ctrlKey: true, shiftKey: true });
    expect(get().doc!.stress).toBe(2);
    key({ key: 'z' }); // no modifier: ignored
    expect(get().doc!.stress).toBe(2);
    off();
  });
});

describe('autosave', () => {
  it('saves once, 800 ms after the last edit', async () => {
    setStress(1);
    expect(get().saveState).toBe('dirty');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY - 1);
    setStress(2); // re-arms the timer
    await vi.advanceTimersByTimeAsync(SAVE_DELAY - 1);
    expect(saveCharacter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(saveCharacter).toHaveBeenCalledTimes(1);
    expect(saveCharacter.mock.calls[0]).toEqual([expect.objectContaining({ stress: 2 }), undefined]);
    expect(get().saveState).toBe('saved');
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveCharacter).toHaveBeenCalledTimes(1);
  });

  it('undo is saved too', async () => {
    setStress(4);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
    get().undo();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
    expect(saveCharacter).toHaveBeenCalledTimes(2);
    expect(saveCharacter.mock.calls[1][0]).toMatchObject({ stress: 0 });
  });

  it('keeps the edit dirty and reports an error when saving fails', async () => {
    saveCharacter.mockRejectedValueOnce(new Error('disk'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setStress(1);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
    expect(get().saveState).toBe('error');
    setStress(2); // the next edit retries
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
    expect(get().saveState).toBe('saved');
  });

  it('a revision after 10 minutes of editing, none before', async () => {
    setStress(1);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
    expect(saveRevision).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(REVISION_EVERY);
    setStress(2);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
    expect(saveRevision).toHaveBeenCalledTimes(1);
    setStress(3);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
    expect(saveRevision).toHaveBeenCalledTimes(1); // the clock restarted
  });

  it('flush on close saves pending edits and a closing revision; nothing to do when untouched', async () => {
    await get().flush('close');
    expect(saveRevision).not.toHaveBeenCalled();
    setStress(1);
    await get().flush('close');
    expect(saveCharacter).toHaveBeenCalledTimes(1);
    expect(saveRevision).toHaveBeenCalledWith(get().doc!.id, 'close');
  });
});

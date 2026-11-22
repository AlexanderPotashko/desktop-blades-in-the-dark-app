import { describe, expect, it, vi } from 'vitest';
import { loadCharacter, migrate } from '../migrate';

const v1 = () => ({ id: crypto.randomUUID(), schemaVersion: 1, playbookId: 'leech', actions: { tinker: 2 } });

describe('document migrations', () => {
  it('current version: validated, no backup', async () => {
    const backup = vi.fn();
    const doc = v1();
    const c = await loadCharacter(doc, backup);
    expect(c.actions).toEqual({ tinker: 2 });
    expect(c.items).toEqual([]); // defaults filled
    expect(backup).not.toHaveBeenCalled();
  });

  it('runs the chain in order, backs up the untouched original first, never mutates input', async () => {
    const calls: string[] = [];
    const chain = {
      1: (d: Record<string, unknown>) => { calls.push('1→2'); return { ...d, a: 1 }; },
      2: (d: Record<string, unknown>) => { calls.push('2→3'); return { ...d, b: (d.a as number) + 1 }; },
    };
    const doc = v1();
    const before = structuredClone(doc);
    const backup = vi.fn(async (d: unknown, from: number) => { calls.push(`backup v${from}`); expect(d).toEqual(before); });
    const out = await migrate(doc, backup, chain, 3);
    expect(calls).toEqual(['backup v1', '1→2', '2→3']);
    expect(out).toMatchObject({ schemaVersion: 3, a: 1, b: 2 });
    expect(doc).toEqual(before);
  });

  it('a failing backup stops the migration', async () => {
    const step = vi.fn((d: Record<string, unknown>) => d);
    await expect(migrate(v1(), () => Promise.reject(new Error('disk full')), { 1: step }, 2)).rejects.toThrow('disk full');
    expect(step).not.toHaveBeenCalled();
  });

  it('a gap in the chain fails before the backup', async () => {
    const backup = vi.fn();
    await expect(migrate(v1(), backup, { 1: d => d }, 3)).rejects.toThrow('no migration from v2');
    expect(backup).not.toHaveBeenCalled();
  });

  it('rejects newer, missing or bad versions', async () => {
    await expect(migrate({ ...v1(), schemaVersion: 2 })).rejects.toThrow('newer');
    await expect(migrate({ name: 'x', actions: { 'Ремесло': 2 } })).rejects.toThrow('importPrototype');
    await expect(migrate([])).rejects.toThrow('object');
    await expect(migrate(null)).rejects.toThrow('object');
    await expect(loadCharacter({ ...v1(), playbookId: 'Умелец' })).rejects.toThrow();
  });
});

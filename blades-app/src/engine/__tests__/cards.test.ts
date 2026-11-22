import { describe, expect, it } from 'vitest';
import { headingsOf, matchesCard, parseNote, reorderCards, rollsInText, roomText, visibleCards, type RollLabels } from '../cards';
import type { Card } from '../../model';

const L: RollLabels = { sum: 'sum', best: 'best', crit: 'crit', success: 'success', partial: 'partial', fail: 'fail' };
const c = (id: string, o: Partial<Card> = {}): Card => ({ id, kind: 'note', title: id, text: '', pinned: false, images: [], ...o });
const ids = (cs: Card[]) => cs.map((x) => x.id);

describe('order and drag-and-drop', () => {
  const cards = [c('a'), c('r1', { kind: 'rule' }), c('b', { pinned: true }), c('d'), c('e', { pinned: true })];
  it('pinned first, kinds apart', () => {
    expect(ids(visibleCards(cards, 'note'))).toEqual(['b', 'e', 'a', 'd']);
    expect(ids(visibleCards(cards, 'rule'))).toEqual(['r1']);
  });
  it('dropping onto a pinned card pins, onto a loose one unpins; other kind keeps its slots', () => {
    const up = reorderCards(cards, 'note', 'd', 'e');
    expect(ids(visibleCards(up, 'note'))).toEqual(['b', 'd', 'e', 'a']);
    expect(up.find((x) => x.id === 'd')!.pinned).toBe(true);
    expect(up[1].id).toBe('r1');
    const down = reorderCards(cards, 'note', 'b', 'd');
    expect(ids(visibleCards(down, 'note'))).toEqual(['e', 'a', 'd', 'b']);
    expect(down.find((x) => x.id === 'b')!.pinned).toBe(false);
  });
  it('dropping on itself changes nothing', () => expect(reorderCards(cards, 'note', 'a', 'a')).toEqual(cards));
});

describe('search', () => {
  it('title and text, case-insensitive, ё = е', () => {
    const k = c('x', { title: 'Ёлка Кабинет', text: 'в подвале ЛЕДЕНЕЦ' });
    expect(matchesCard(k, 'елка')).toBe(true);
    expect(matchesCard(k, 'ПОДВАЛЕ')).toBe(true);
    expect(matchesCard(k, 'ледёнец')).toBe(true);
    expect(matchesCard(k, 'zzz')).toBe(false);
    expect(matchesCard(k, '  ')).toBe(true);
  });
});

describe('dice rolls', () => {
  it('rewrites chat rolls the Blades way', () => {
    expect(rollsInText('rolling 5d6 ( 2 + 4 + 3 + 1 + 2 ) =12', L)).toBe('🎲 5d6 → 2 4 3 1 2 · best 4 → 4–5: partial');
    expect(rollsInText('Bob:rolling 3d6 ( 6 + 6 + 1 ) = 13', L)).toBe('Bob:🎲 3d6 → 6 6 1 · best 6 → 6&6: crit');
    expect(rollsInText('rolling d6 (\n 2 +\n 3 ) = 5', L)).toBe('🎲 1d6 → 2 3 · best 3 → 1–3: fail');
    expect(rollsInText('rolling 2d10 ( 4 + 9 ) = 13', L)).toBe('🎲 2d10 → 4 9 · sum 13');
  });
  it('is idempotent and leaves other text alone', () => {
    const once = rollsInText('hi\nrolling 2d6 ( 6 + 2 ) = 8\nbye', L);
    expect(rollsInText(once, L)).toBe(once);
    expect(once.startsWith('hi\n')).toBe(true);
  });
  it('the note view reads them back as roll chips', () => {
    const b = parseNote('Bob:rolling 3d6 ( 6 + 6 + 1 ) = 13\n[ Floor ]\n- item', L);
    expect(b[0]).toMatchObject({ t: 'roll', who: 'Bob', die: '3d6', dice: '6 6 1', cls: 'rc' });
    expect(b[1]).toMatchObject({ t: 'h3', s: 'Floor' });
    expect(b[2]).toMatchObject({ t: 'li', s: 'item' });
    expect(parseNote('rolling 1d6 ( 6 ) = 6', L)[0]).toMatchObject({ t: 'roll', cls: 'r6' });
  });
});

describe('plan headings', () => {
  const text = '[ Ground ]\n[[ Hall ]]\nwide\n[[ Study ]]\nbooks\nmore\n[ Cellar ]\n[[ Vault ]]';
  it('floors and rooms', () => expect(headingsOf(text)).toEqual([{ floor: 'Ground', rooms: ['Hall', 'Study'] }, { floor: 'Cellar', rooms: ['Vault'] }]));
  it('room text up to the next heading', () => {
    expect(roomText(text, 'Study')).toBe('books\nmore');
    expect(roomText(text, 'Nope')).toBeNull();
  });
});

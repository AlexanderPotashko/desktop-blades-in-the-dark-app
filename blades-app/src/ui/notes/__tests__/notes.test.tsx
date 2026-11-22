// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { setLang } from '../../../i18n';
import { newCharacter } from '../../../store/actions';
import { addCard, moveCard, planFromText, setCard, togglePin } from '../../../store/notesActions';
import { addContact, flipContact, setContact, setOrigin } from '../../../store/backgroundActions';
import { useStore } from '../../../store/store';
import { Background } from '../../background/Background';
import { Notes } from '../Notes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLElement;
const qa = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
const type = (el: Element, v: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const choose = (el: Element, v: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const titles = () => qa('.ci .ct').map((e) => e.textContent);
const cards = () => useStore.getState().doc!.cards;
const doc = () => useStore.getState().doc!;

beforeEach(() => {
  setLang('ru');
  useStore.getState().open(newCharacter('leech'));
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const seed = () => {
  for (const [title, text] of [['Склад', 'ёлка в подвале'], ['Резо', 'колдун'], ['Банда', 'налоги']]) {
    const id = addCard('note');
    setCard(id, { title, text });
  }
  addCard('rule');
};
const run = (f: () => void) => act(async () => void f());
const by = (t: string) => cards().find((c) => c.title === t)!.id;

describe('Notes tab', () => {
  it('lists cards of its kind, newest first, pinned on top', async () => {
    seed();
    await act(async () => root.render(<Notes kind="note" />));
    expect(titles()).toEqual(['Банда', 'Резо', 'Склад']);
    await run(() => togglePin(by('Склад')));
    expect(titles()).toEqual(['Склад', 'Банда', 'Резо']);
    expect(qa('.ci.pin')).toHaveLength(1);
  });

  it('rules tab shows only rule cards', async () => {
    seed();
    await act(async () => root.render(<Notes kind="rule" />));
    expect(qa('.ci')).toHaveLength(1);
  });

  it('search filters by title and text, ё = е', async () => {
    seed();
    await act(async () => root.render(<Notes kind="note" />));
    const box = host.querySelector('[data-testid=card-search]')!;
    await type(box, 'ЕЛКА');
    expect(titles()).toEqual(['Склад']);
    await type(box, 'рез');
    expect(titles()).toEqual(['Резо']);
    await type(box, 'zzz');
    expect(titles()).toEqual([]);
    expect(host.textContent).toContain('Ничего не найдено');
  });

  it('moveCard pins when dropped onto a pinned card', async () => {
    seed();
    togglePin(by('Склад'));
    moveCard('note', by('Банда'), by('Склад'));
    await act(async () => root.render(<Notes kind="note" />));
    expect(titles()).toEqual(['Банда', 'Склад', 'Резо']);
    expect(cards().find((c) => c.title === 'Банда')!.pinned).toBe(true);
  });

  it('shows the rendered view of a chat roll and lets you edit it', async () => {
    const id = addCard('note');
    setCard(id, { title: 'Лог', text: 'Боб:rolling 2d6 ( 6 + 6 ) = 12' });
    await act(async () => root.render(<Notes kind="note" />));
    expect(host.querySelector('.nroll')!.textContent).toContain('6&6');
    await act(async () => void host.querySelector('[data-testid=card-view]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(host.querySelector('[data-testid=card-text]')).not.toBeNull();
  });

  it('plan from text makes floors and rooms once', () => {
    const id = addCard('note');
    setCard(id, { text: '[ Низ ]\n[[ Холл ]]\n[[ Кухня ]]' });
    expect(planFromText(id)).toBe(2);
    expect(planFromText(id)).toBe(0);
    const p = cards()[0].plan!;
    expect(p.floors).toHaveLength(1);
    expect(p.floors[0].name).toBe('Низ');
    expect(p.floors[0].shapes.map((s) => s.kind === 'room' && s.label)).toEqual(['Холл', 'Кухня']);
  });
});

describe('Biography tab', () => {
  it('book and custom origin, book and custom contacts', async () => {
    await act(async () => root.render(<Background />));
    await choose(host.querySelector('[data-testid=origin-heritage]')!, 'iruvia');
    expect(doc().heritage).toMatchObject({ bookId: 'iruvia' });
    await choose(host.querySelector('[data-testid=origin-vice]')!, '__custom');
    await type(host.querySelector('[data-testid=origin-vice-name]')!, 'Клятва хакима');
    expect(doc().vice).toMatchObject({ name: 'Клятва хакима' });
    expect(doc().vice.bookId).toBeUndefined();

    await choose(host.querySelector('[data-testid=add-contact]')!, 'stazia');
    await choose(host.querySelector('[data-testid=add-contact]')!, '__custom');
    const [book, own] = doc().contacts;
    expect(book).toMatchObject({ bookId: 'stazia', rel: 'up' });
    expect(own.bookId).toBeUndefined();
    expect(host.querySelector(`[data-contact="${book.id}"]`)!.textContent).toContain('Стация');
    await run(() => void addContact('stazia')); // a book contact is added once
    expect(doc().contacts).toHaveLength(2);
    await run(() => { flipContact(book.id); setContact(own.id, { name: 'Малыш Тео', note: 'должен 5 драхм' }); });
    expect(qa('.contact.down')).toHaveLength(1);
    expect((host.querySelector(`[data-contact="${own.id}"] input`) as HTMLInputElement).value).toBe('Малыш Тео');
    await run(() => setOrigin('heritage', {}));
    expect(doc().heritage.bookId).toBeUndefined();
  });
});

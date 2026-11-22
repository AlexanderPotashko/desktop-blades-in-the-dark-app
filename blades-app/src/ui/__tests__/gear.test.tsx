// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../../App';
import { loadUsed } from '../../engine/load';
import { setLang } from '../../i18n';
import { setRule } from '../../store/actions';
import { useStore } from '../../store/store';
import { useUi } from '../../store/ui';
import { addCustomItem, setCarried, setLoad, setQty } from '../../store/gearActions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLElement;
const q = <T extends Element>(s: string) => host.querySelector<T>(s)!;
const qa = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
const doc = () => useStore.getState().doc!;
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const type = (el: Element, v: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const choose = (el: HTMLSelectElement, v: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const goTab = (n: number) => click(qa('.tabs button')[n]);
const act0 = (f: () => void) => act(async () => f());

beforeEach(async () => {
  localStorage.clear();
  setLang('ru');
  useUi.setState({ lang: 'ru', tab: 'sheet', tips: false, lastCharacter: undefined });
  useStore.setState({ doc: null });
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await act(async () => {});
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Снаряжение: нагрузка', () => {
  it('counts only what is on you (carried x load), not what is at base', async () => {
    await goTab(1);
    const before = loadUsed(doc().items);
    await act0(() => addCustomItem());
    const id = doc().items.at(-1)!.id;
    await act0(() => { setLoad(id, 2); setQty(id, 3); });
    expect(doc().items.at(-1)!.carried).toBe(1); // carried stays, qty grew
    await act0(() => setCarried(id, 2));
    expect(loadUsed(doc().items)).toBe(before + 4);
    expect(q('[data-testid=load-used]').textContent).toContain(`${before + 4} / 5`);
    // all at base: load does not count it
    await act0(() => setCarried(id, 0));
    expect(q('[data-testid=load-used]').textContent).toContain(`${before} /`);
    // the toggle of a single item moves it between "on me" and "at base"
    const first = q('[data-item] button[data-f=base]');
    await click(first);
    expect(doc().items[0].carried).toBe(0);
  });

  it('load selector changes the limit', async () => {
    await goTab(1);
    await choose(q<HTMLSelectElement>('select[aria-label="Нагрузка"]'), 'heavy');
    expect(q('[data-testid=load-used]').textContent).toMatch(/\/ 6$/);
  });

  it('house rule "load off" hides selector, count and load column; total and carried stay', async () => {
    await act0(() => { setRule('mode', 'custom'); setRule('load', false); });
    await goTab(1);
    expect(host.querySelector('select[aria-label="Нагрузка"]')).toBeNull();
    expect(host.querySelector('[data-testid=load-used]')).toBeNull();
    expect(host.querySelector('[data-item] input[data-f=load]')).toBeNull();
    expect(host.querySelector('[data-item] input[data-f=qty]')).not.toBeNull();
    expect(host.querySelector('[data-item] [data-f=base], [data-item] input[data-f=carried]')).not.toBeNull();
  });

  it('own item can be renamed and a book item keeps its book name as placeholder', async () => {
    await goTab(1);
    const row = q('[data-item]');
    const nameInput = row.querySelector<HTMLInputElement>('input[data-f=name]')!;
    expect(nameInput.value).not.toBe('');
    await type(nameInput, 'Мой набор');
    expect(doc().items[0].name).toBe('Мой набор');
    await type(q<HTMLInputElement>('[data-item] input[data-f=name]'), '');
    expect(doc().items[0].name).toBeUndefined();
  });
});

describe('Снаряжение: деньги', () => {
  it('book: coins and stash boxes, lifestyle info', async () => {
    await goTab(1);
    expect(qa('[data-testid=money-book] [role=checkbox]')).toHaveLength(44);
    await click(qa('[aria-label="Заначка 15"]')[0]);
    expect(doc().money.stash).toBe(15);
    expect(q('[data-testid=stash-info]').textContent).toContain('Уровень жизни 1');
  });

  it('own currency: break / join by rate, total and calculator', async () => {
    await act0(() => {
      setRule('mode', 'custom');
      setRule('money', { book: false, major: 'драхма', minor: 'драхмёныш', rate: 20 });
    });
    await goTab(1);
    const major = q<HTMLInputElement>('input[aria-label="драхма"]');
    await type(major, '2');
    expect(doc().money.major).toBe(2);
    const [brk, join] = qa('[data-testid=money-custom] button');
    await click(brk);
    expect([doc().money.major, doc().money.minor]).toEqual([1, 20]);
    await click(brk);
    expect([doc().money.major, doc().money.minor]).toEqual([0, 40]);
    expect(brk.hasAttribute('disabled')).toBe(true);
    await click(join);
    expect([doc().money.major, doc().money.minor]).toEqual([1, 20]);
    expect(q('[data-testid=money-total]').textContent).toBe('Всего: 40 драхмёныш = 2 драхма');
    // calculator converts both ways
    await type(q('input[aria-label="Калькулятор драхма"]'), '1.5');
    expect(q<HTMLInputElement>('input[aria-label="Калькулятор драхмёныш"]').value).toBe('30');
    await type(q('input[aria-label="Калькулятор драхмёныш"]'), '10');
    expect(q<HTMLInputElement>('input[aria-label="Калькулятор драхма"]').value).toBe('0.5');
  });
});

describe('Мастерская', () => {
  it('project -> gear (at base) and own gear item -> project', async () => {
    await goTab(2);
    await choose(q<HTMLSelectElement>('select[aria-label="+ добавить изделие…"]'), 'new');
    const row = q('[data-project]');
    await type(row.querySelector('input[data-f=name]')!, 'Зелье');
    await type(row.querySelector('input[data-f=done]')!, '2');
    await type(row.querySelector('input[data-f=total]')!, '4');
    await type(row.querySelector('input[data-f=qty]')!, '3');
    expect(doc().workshop[0]).toMatchObject({ name: 'Зелье', done: 2, total: 4, qty: 3 });
    expect(qa('.prog-boxes .box')).toHaveLength(4);
    const n = doc().items.length;
    await click(q('[data-project] button[data-act=to-gear]'));
    expect(doc().workshop).toHaveLength(0);
    expect(doc().items).toHaveLength(n + 1);
    expect(doc().items.at(-1)).toMatchObject({ name: 'Зелье', qty: 3, carried: 0, place: 'gear' });
    // back: the picker offers own gear items
    const id = doc().items.at(-1)!.id;
    await choose(q<HTMLSelectElement>('select[aria-label="+ добавить изделие…"]'), id);
    expect(doc().items).toHaveLength(n);
    expect(doc().workshop[0]).toMatchObject({ name: 'Зелье', qty: 3 });
  });

  it('equipment: gear item -> workshop (not counted in load) and back to base', async () => {
    const before = loadUsed(doc().items);
    const first = doc().items.find((i) => i.place === 'gear' && i.load > 0 && i.carried)!;
    await goTab(2);
    await choose(q<HTMLSelectElement>('select[aria-label="+ добавить оснащение…"]'), first.id);
    expect(doc().items.find((i) => i.id === first.id)).toMatchObject({ place: 'workshop', carried: 0 });
    expect(loadUsed(doc().items)).toBe(before - first.load);
    expect(qa('[data-equip]')).toHaveLength(1);
    await click(q('[data-equip] button[data-act=to-gear]'));
    expect(doc().items.find((i) => i.id === first.id)).toMatchObject({ place: 'gear', carried: 0 });
    await goTab(1);
    expect(qa('[data-item]').some((r) => r.dataset.item === first.id && r.classList.contains('off'))).toBe(true);
  });

  it('item dialog: properties and −1 use', async () => {
    await goTab(2);
    await choose(q<HTMLSelectElement>('select[aria-label="+ добавить изделие…"]'), 'new');
    await click(q('[data-project] button[aria-label="Заметка и свойства"]'));
    await click(q('[data-testid=item-dialog] button[aria-label="Свойства предмета"]'));
    const nums = qa('[data-testid=item-props] input[type=number]');
    await type(nums[1], '3'); // total uses
    await choose(q<HTMLSelectElement>('[data-testid=item-props] select'), 'alchemical');
    await click(qa('[data-testid=item-props] input[type=checkbox]')[2]); // 'dangerous'
    const p = doc().workshop[0].props;
    expect(p).toMatchObject({ uses: 3, type: 'alchemical', flaws: ['dangerous'] });
    await click(qa('button').find((b) => b.textContent === 'Готово')!);
    await click(q('.propline button.mini'));
    expect(doc().workshop[0].props.usesLeft).toBe(2);
  });
});

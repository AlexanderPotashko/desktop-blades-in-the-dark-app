// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../../App';
import { setLang } from '../../i18n';
import { useStore } from '../../store/store';
import { useUi } from '../../store/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLElement;
const q = <T extends Element>(s: string) => host.querySelector<T>(s)!;
const qa = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const choose = (el: HTMLSelectElement, v: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const goSettings = () => click(host.querySelector('button[aria-label="Настройки"]')!);

beforeEach(async () => {
  localStorage.clear();
  setLang('ru');
  useUi.setState({ lang: 'ru', tab: 'sheet', tips: false, lastCharacter: undefined });
  useStore.setState({ doc: null });
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await act(async () => {}); // boot() promises
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Бланк', () => {
  it('first run: sample Leech with its ready kit, attributes and stage message', () => {
    expect(q<HTMLInputElement>('[data-testid=name]').value).toBe('Новый персонаж');
    expect(q('[data-testid=attr-insight]').textContent).toBe('2'); // tinker + study
    expect(q('[data-testid=stage-info]').textContent).toContain('7 / 7');
    expect(qa('[data-talent]').map((e) => e.dataset.talent)).toEqual(['physicker']);
    expect(qa('[data-testid=stress] .box')).toHaveLength(9);
  });

  it('dots set a rating, attribute and stage message follow, undo button reverts', async () => {
    const dots = qa('[data-attr=resolve] .dot');
    await click(dots[3]); // Manipulation 4
    expect(q('[data-testid=attr-resolve]').textContent).toBe('2');
    expect(q('[data-testid=stage-info]').textContent).toMatch(/больше лимита/);
    await click(host.querySelector('button[aria-label^="Отменить"]')!);
    expect(q('[data-testid=attr-resolve]').textContent).toBe('1');
  });

  it('stress boxes follow the rules: custom count', async () => {
    await goSettings();
    await click(q('input[name=mode][value=custom]'));
    await click(qa('fieldset input[type=checkbox]')[1]); // stress.book off
    const n = qa('input[type=number]').find((i) => (i as HTMLInputElement).max === '20')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(n, '12');
      n.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(host.querySelector('button[aria-label="Настройки"]')!);
    expect(qa('[data-testid=stress] .box')).toHaveLength(12);
  });

  it('special armor: one shared box by the book, one per talent in house rules', async () => {
    const add = q<HTMLSelectElement>('select[aria-label="+ добавить талант…"]');
    await choose(add, 'fortitude');
    expect(qa('[data-special]').map((e) => e.dataset.special)).toEqual(['shared']);
    await click(q('[data-special] .box'));
    expect(useStore.getState().doc!.specialArmorShared).toBe(true);
    await goSettings();
    await click(q('input[name=mode][value=custom]'));
    await click(qa('fieldset input[type=checkbox]').find((i) => i.parentElement!.textContent!.includes('Особая защита по книге'))!);
    await goSettings();
    expect(qa('[data-special]').map((e) => e.dataset.special)).toEqual(['fortitude']);
  });

  it('counters: preset from a talent, +/−, boxes up to 12, rest resets them', async () => {
    await choose(q('select[aria-label="+ добавить талант…"]'), 'analyst');
    expect(qa('[data-counter]')).toHaveLength(1);
    expect(qa('[data-counter] .cboxes .box')).toHaveLength(2); // Analyst: 2 boxes, resets on downtime
    await click(q('[data-counter] button[aria-label="+1"]'));
    await click(q('[data-counter] button[aria-label="+1"]'));
    await click(q('[data-counter] button[aria-label="+1"]')); // capped at max
    expect(qa('[data-counter] .box.on')).toHaveLength(2);
    await click(qa('.rest button').find((b) => b.textContent === 'Передышка')!);
    expect(qa('[data-counter] .box.on')).toHaveLength(0);
    expect(q('[data-testid=rest-msg]').textContent).toContain('Сброшено');
  });

  it('language switch renames book content', async () => {
    await goSettings();
    await choose(q<HTMLSelectElement>('select[aria-label="Язык"]'), 'en');
    expect(useUi.getState().lang).toBe('en');
    await click(host.querySelector('button[aria-label="Settings"]')!);
    expect(q('h1').textContent).toBe('Leech');
    expect(qa('.tabs button')[0].textContent).toBe('Sheet');
  });

  it('every tab is implemented (no placeholder)', async () => {
    for (let i = 0; i < qa('.tabs button').length; i++) {
      await click(qa('.tabs button')[i]);
      expect(host.textContent).not.toContain('появится позже');
    }
  });
});

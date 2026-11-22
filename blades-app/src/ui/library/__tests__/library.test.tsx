// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../../../App';
import * as db from '../../../api/db';
import { setLang } from '../../../i18n';
import { newCharacter } from '../../../store/actions';
import { useStore } from '../../../store/store';
import { useUi } from '../../../store/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLElement;
const q = <T extends Element>(s: string) => host.querySelector<T>(s)!;
const qa = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = async (el: Element) => { await act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush(); };
const type = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const byText = (sel: string, text: string) => qa(sel).find((e) => e.textContent === text)!;
const rows = () => qa('[data-testid=char-row]');

beforeEach(async () => {
  localStorage.clear();
  setLang('ru');
  useUi.setState({ lang: 'ru', tab: 'sheet', tips: false, lastCharacter: undefined });
  useStore.setState({ doc: null });
  await db.saveCharacter(newCharacter('leech', { name: 'Сандр' }));
  await db.saveCharacter(newCharacter('leech', { name: 'Вельдрен' }));
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => root.render(<App />));
  await flush();
  await click(q('[data-testid=library-btn]'));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Библиотека', () => {
  it('lists sheets, searches, duplicates, archives, deletes only after confirmation', async () => {
    expect(rows()).toHaveLength(2);
    await type(q('input[type=search]'), 'вельд');
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Вельдрен')]);
    await type(q('input[type=search]'), '');

    await click(rows()[0].querySelector('[data-act=dup]')!);
    expect(rows()).toHaveLength(3);
    expect(qa('[data-testid=char-row] b').some((b) => b.textContent!.endsWith('(копия)'))).toBe(true);

    const target = rows().find((r) => r.textContent!.includes('Вельдрен'))!;
    await click(target.querySelector('[data-act=archive]')!);
    expect(rows()).toHaveLength(2); // archived are hidden
    await click(q('input[type=checkbox]'));
    expect(rows()).toHaveLength(3);

    const del = () => rows()[0].querySelector<HTMLElement>('button.danger')!;
    await click(del()); // first click only asks
    expect(rows()).toHaveLength(3);
    await click(byText('button', 'Нет'));
    expect(rows()).toHaveLength(3);
    await click(del());
    await click(byText('button', 'Да'));
    expect(rows()).toHaveLength(2);
  });

  it('open switches the sheet; the header dropdown switches too', async () => {
    const row = rows().find((r) => r.textContent!.includes('Вельдрен'))!;
    await click(row.querySelector('[data-act=open]')!);
    expect(q<HTMLInputElement>('[data-testid=name]').value).toBe('Вельдрен');
    const sel = q<HTMLSelectElement>('[data-testid=quick-switch]');
    const other = [...sel.options].find((o) => o.textContent!.includes('Сандр'))!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, other.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(q<HTMLInputElement>('[data-testid=name]').value).toBe('Сандр');
  });

  it('campaign: create, add a member, add and search a ruling, history shows the preview', async () => {
    await type(q('[data-testid=campaigns] input'), 'Ирувия');
    await click(q('[data-testid=camp-create]'));
    expect(q('[data-testid=campaign]')).toBeTruthy();

    const add = q<HTMLSelectElement>('[data-testid=campaign] select[aria-label="Добавить лист…"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(add, add.options[1].value);
      add.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(byText('[data-testid=campaign] button', 'Добавить'));
    expect(qa('[data-testid=campaign] .members li')).toHaveLength(1);
    expect((await db.listCharacters()).filter((r) => r.campaignId)).toHaveLength(1);

    const form = q('[data-testid=ruling-form]');
    await type(form.querySelector('input[aria-label="Кто сказал"]')!, 'Хитрый_Лосось');
    await type(form.querySelector('textarea')!, 'Порох — редкость');
    await click(form.querySelector('button')!);
    expect(q('[data-testid=rulings]').textContent).toContain('Порох — редкость');
    await type(q('input[aria-label="Поиск по цитатам, автору, теме"]'), 'нет такого');
    expect(q('[data-testid=rulings]').textContent).toBe('');

    // history of the first sheet
    const id = rows()[0].dataset.id!;
    await db.saveRevision(id, 'autosave');
    await click(rows()[0].querySelector('[data-act=history]')!);
    await click(q('[data-testid=rev]'));
    expect(q('[data-testid=rev-preview]')).toBeTruthy();
    expect(qa('[data-testid=history] button').some((b) => b.textContent === 'Вернуть эту версию')).toBe(true);
  });
});

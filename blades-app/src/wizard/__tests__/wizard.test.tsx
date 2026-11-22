// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../../App';
import { setLang } from '../../i18n';
import { Character } from '../../model';
import { useStore } from '../../store/store';
import { useUi } from '../../store/ui';
import { applyBuild, buildCharacter, canAddTalent, dotsUsed, newDraft, setDot, setLimits, setMode, setPlaybook, talentsUsed } from '../logic';
import { useWizard } from '../state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('limits by the book (pp. 66-69)', () => {
  it('7 dots for a Leech: 3 start + 4 free, max 2, start dots cannot be lowered', () => {
    let d = newDraft('leech');
    expect(dotsUsed(d)).toBe(3);
    for (const a of ['study', 'sway', 'hunt', 'prowl', 'finesse']) d = setDot(d, a, 2);
    expect(dotsUsed(d)).toBe(7); // the 5th request was refused: only 4 free dots
    expect(d.actions.finesse).toBe(0);
    d = setDot(d, 'tinker', 3); // max 2
    expect(d.actions.tinker).toBe(2);
    d = setDot(d, 'tinker', 0); // floor is the playbook's start
    expect(d.actions.tinker).toBe(2);
  });
  it('one own talent only; foreign talents are refused', () => {
    let d = newDraft('leech');
    expect(canAddTalent(d, 'physicker')).toBe(true);
    expect(canAddTalent(d, 'battleborn')).toBe(false); // a Cutter talent
    d = { ...d, talents: ['physicker'] };
    expect(canAddTalent(d, 'saboteur')).toBe(false);
  });
});

describe('ready-made build', () => {
  it('pre-fills dots and talent, and stays within the limits', () => {
    const d = applyBuild(newDraft('leech'), 'leech-physician');
    expect(d.actions).toMatchObject({ tinker: 2, wreck: 1, study: 2, consort: 1, finesse: 1 });
    expect(dotsUsed(d)).toBe(7);
    expect(d.talents).toEqual(['physicker']);
    expect(applyBuild(d, undefined).talents).toEqual([]);
  });
});

describe('joined a running game', () => {
  const run = () => setMode(newDraft('leech'), 'running');
  it('14 dots, max 4, 3 talents by default', () => {
    let d = run();
    d = setDot(d, 'tinker', 4);
    d = setDot(d, 'study', 4);
    expect(d.actions).toMatchObject({ tinker: 4, study: 4 });
    for (const a of ['sway', 'hunt', 'prowl', 'finesse', 'attune', 'survey', 'skirmish', 'consort']) d = setDot(d, a, 4);
    expect(dotsUsed(d)).toBe(14);
    expect(d.actions.wreck).toBe(1);
  });
  it('foreign talent costs 2 of 3; the price is configurable', () => {
    let d = { ...run(), talents: ['physicker'] };
    expect(talentsUsed(d)).toBe(1);
    expect(canAddTalent(d, 'battleborn')).toBe(true); // 1 + 2 = 3
    d = { ...d, talents: ['physicker', 'battleborn'] };
    expect(talentsUsed(d)).toBe(3);
    expect(canAddTalent(d, 'saboteur')).toBe(false); // full
    d = setLimits(d, { foreignCost: 1 });
    expect(talentsUsed(d)).toBe(2);
    expect(canAddTalent(d, 'saboteur')).toBe(true);
    d = setLimits(d, { talents: 1 }); // trimmed from the end
    expect(d.talents).toEqual(['physicker']);
  });
  it('lowering the limits clamps the draft', () => {
    let d = run();
    for (const a of ['tinker', 'study', 'sway', 'hunt']) d = setDot(d, a, 4);
    d = setLimits(d, { dots: 8, maxRating: 3 });
    expect(dotsUsed(d)).toBeLessThanOrEqual(8);
    expect(Math.max(...Object.values(d.actions))).toBeLessThanOrEqual(3);
  });
  it('switching playbook resets dots but keeps limits and name', () => {
    const d = setPlaybook({ ...run(), name: 'X' }, 'cutter');
    expect(d.name).toBe('X');
    expect(d.mode).toBe('running');
    expect(d.actions.skirmish).toBeGreaterThan(0);
  });
});

describe('result', () => {
  it('parses as a Character, by the book', () => {
    let d = applyBuild(newDraft('leech'), 'leech-physician');
    d = { ...d, name: ' Сандр ', heritage: { bookId: 'iruvia', note: '' }, vice: { name: 'Клятва', note: '' }, friend: { bookId: 'stazia', note: '' }, rival: { name: 'Враг', note: '' } };
    const c = buildCharacter(d);
    expect(Character.parse(c)).toEqual(c);
    expect(c.name).toBe('Сандр');
    expect(c.talents).toEqual(['physicker']);
    expect(c.contacts.map((x) => x.rel)).toEqual(['up', 'down']);
    expect(c.items.length).toBeGreaterThan(0);
    expect(c.rulesOverride).toBeUndefined();
  });
  it('running mode: free skill stage, own foreign cost, custom talent', () => {
    let d = setMode(newDraft('leech'), 'running');
    d = setDot(d, 'tinker', 4);
    d = { ...d, customTalents: [{ name: 'Хаким', text: 'клятва' }] };
    const c = buildCharacter(d);
    expect(c.actions.tinker).toBe(4);
    expect(c.rulesOverride).toEqual({ mode: 'custom', skillStage: 'mastery', foreignTalentCost: 2 });
    expect(c.customTalents[0].name).toBe('Хаким');
  });
  it('analyst talent brings its counter', () => {
    const c = buildCharacter({ ...newDraft('leech'), talents: ['analyst'] });
    expect(c.counters).toHaveLength(1);
    expect(c.presetsApplied).toEqual(['analyst']);
  });
});

describe('wizard UI', () => {
  let root: Root, host: HTMLElement;
  const q = <T extends Element>(s: string) => host.querySelector<T>(s)!;
  const qa = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
  const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  beforeEach(async () => {
    localStorage.clear();
    setLang('ru');
    useUi.setState({ lang: 'ru', tab: 'sheet', tips: false, lastCharacter: undefined });
    useStore.setState({ doc: null });
    useWizard.setState({ open: false });
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    await act(async () => root.render(<App />));
    await act(async () => {});
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('walks all steps and creates the character', async () => {
    await click(q('[data-testid=new-character]'));
    expect(q('[data-testid=wizard]')).toBeTruthy();
    await click(q('[data-playbook=cutter]'));
    await click(q('[data-testid=wiz-next]')); // heritage
    await click(q('[data-id=akoros]'));
    await click(q('[data-testid=wiz-next]')); // background
    await click(q('[data-id=law]'));
    await click(q('[data-testid=wiz-next]')); // actions
    expect(q('[data-testid=dots-left]').textContent).toContain('Осталось точек: 4 из 7');
    await click(q('[data-action=hunt] .dot:nth-child(2)'));
    expect(q('[data-testid=dots-left]').textContent).toContain('Осталось точек: 2');
    await click(q('[data-testid=wiz-next]')); // talents
    await click(q('[data-talent] input'));
    expect(q('[data-testid=talents-left]').textContent).toContain('1 из 1');
    await click(q('[data-testid=wiz-next]')); // contacts
    await click(q('[data-testid=wiz-next]')); // vice
    await click(q('[data-testid=wiz-next]')); // identity
    await act(async () => {
      const el = q<HTMLInputElement>('[data-testid=wiz-name]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'Тест');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(q('[data-testid=wiz-finish]'));
    expect(host.querySelector('[data-testid=wizard]')).toBeNull();
    const doc = useStore.getState().doc!;
    expect(doc.playbookId).toBe('cutter');
    expect(doc.name).toBe('Тест');
    expect(doc.heritage.bookId).toBe('akoros');
    expect(doc.actions).toMatchObject({ skirmish: 2, command: 1, hunt: 2 });
    expect(doc.talents).toHaveLength(1);
  });

  it('shows the running-game limits', async () => {
    await click(q('[data-testid=new-character]'));
    await click(q('[data-testid=mode-running]'));
    expect(q<HTMLInputElement>('[data-testid=lim-dots]').value).toBe('14');
    await click(q('[data-testid=wiz-next]'));
    expect(qa('[data-testid=wizard] .tabs button')).toHaveLength(8);
  });
});

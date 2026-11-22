// Smoke test for charsheet.html in jsdom. Plain node:assert, no framework.
// Run: npm test (from tools/test). Does not modify charsheet.html.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const HTML = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'charsheet.html'), 'utf8');
const KEY = 'bitd-leech';
const URL_ = 'http://localhost/charsheet.html';

// rulebook.js is not loaded (jsdom does not fetch external scripts by default): window.RULEBOOK stays undefined,
// which the page handles ("Нет файла rulebook.js"). That is the stub.
function open(storage = null) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e?.message ?? e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(HTML, {
    url: URL_,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.addEventListener('error', e => errors.push('window error: ' + e.message));
      if (storage != null) win.localStorage.setItem(KEY, typeof storage === 'string' ? storage : JSON.stringify(storage));
    },
  });
  const w = dom.window;
  const doc = w.document;
  const $ = s => doc.querySelector(s);
  const $$ = s => [...doc.querySelectorAll(s)];
  const click = el => { assert.ok(el, 'click target not found'); el.click(); };
  const change = (el, value) => {
    assert.ok(el, 'change target not found');
    if (value !== undefined) el.value = value;
    el.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  // read the page's global state S as plain JSON (avoids cross-realm deepEqual issues)
  const state = () => JSON.parse(w.eval('JSON.stringify(S)'));
  return { dom, w, doc, $, $$, click, change, state, errors };
}

const results = [];
let passed = 0, bugs = 0, failed = 0;
// check(name, fn): plain pass/fail. bugCheck(name, fn, note): a failure is a suspected bug in charsheet.html, reported as BUG and exit 0.
function check(name, fn) {
  try { fn(); passed++; console.log(`ok    ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
}
function bugCheck(name, fn) {
  try { fn(); passed++; console.log(`ok    ${name}`); }
  catch (e) { bugs++; console.log(`BUG:  ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
}

// ---------- 1. load with empty storage ----------
const base = open();
check('1. page loads with empty storage, no script errors', () => {
  assert.deepEqual(base.errors, [], 'script errors: ' + base.errors.join(' | '));
  assert.ok(base.$$('#actions .dot').length > 0, 'skill dots not rendered');
  assert.equal(base.$('#ctrs').textContent.trim(), 'Счётчиков нет');
  assert.equal(base.state().rules.mode, 'book', 'fresh state should start in book mode');
});

// ---------- 2. skill dot ----------
check('2. clicking a skill dot changes S.actions and the attribute display', () => {
  const { $$, click, state, $, errors } = base;
  // Изучение is 0 initially -> Чутьё count = 1 (only Ремесло = 2)
  assert.equal($$('#actions .attr')[1].textContent, '1', 'initial Чутьё count');
  click($('.dot[data-a="Изучение"][data-v="1"]'));
  assert.equal(state().actions['Изучение'], 1, 'S.actions.Изучение');
  assert.equal($$('#actions .attr')[0].textContent, 'Чутьё');
  assert.equal($$('#actions .attr')[1].textContent, '2', 'Чутьё count after click');
  assert.ok($('.dot[data-a="Изучение"][data-v="1"]').classList.contains('on'), 'dot not drawn as on');
  // toggling the same dot off
  click($('.dot[data-a="Изучение"][data-v="1"]'));
  assert.equal(state().actions['Изучение'], 0, 'toggle back to 0');
  assert.deepEqual(errors, []);
});

// ---------- 3. Стойкость special armor plate ----------
check('3. Стойкость: plate in #specs, toggled by click, cleared by Передышка', () => {
  const { $, $$, click, change, state, errors } = base;
  change($('#addTalent'), 'Стойкость');
  assert.ok(state().talents.includes('Стойкость'), 'talent not added');
  const box = $('#specs [data-spec="Стойкость"]');
  assert.ok(box, '#specs has no [data-spec] box for Стойкость');
  assert.ok(box.classList.contains('box'), 'data-spec element should be the .box');
  click(box);
  assert.equal(state().spec['Стойкость'], true, 'S.spec not set');
  assert.ok($('#specs [data-spec="Стойкость"]').classList.contains('on'), 'box not drawn on');
  click($('[data-rest="downtime"]'));
  assert.ok(!state().spec['Стойкость'], 'Передышка did not clear S.spec');
  assert.equal($('#specs [data-spec="Стойкость"]').classList.contains('on'), false, 'box still on after rest');
  assert.match($('#restMsg').textContent, /Стойкость/, 'rest message should name the cleared armor');
  assert.deepEqual(errors, []);
});

// ---------- 4. legacy migration of special armor counter ----------
check('4. legacy Стойкость counter migrates to S.spec', () => {
  const seed = {
    talents: ['Стойкость'],
    counters: [{ id: 'x', n: 'Стойкость (особая защита)', v: 1, max: 1, r: 'downtime', from: 'Стойкость' }],
  };
  const o = open(seed);
  assert.deepEqual(o.errors, []);
  const s = o.state();
  assert.ok(!s.counters.some(c => c.from === 'Стойкость'), 'legacy counter still present');
  assert.equal(o.w.eval('S.spec["Стойкость"]'), true, 'S.spec["Стойкость"] !== true');
  assert.ok(o.$('#specs [data-spec="Стойкость"]').classList.contains('on'), 'plate not drawn on');
});

// ---------- 5. anesthesia preset is created once and survives reload ----------
check('5. Ядовитость preset counter is created once and survives reload', () => {
  const seed = {
    talents: ['Ядовитость'],
    rules: { mode: 'custom', presets: false },
    presetDone: ['Ядовитость'],
    counters: [],
  };
  const first = open(seed);
  assert.deepEqual(first.errors, []);
  const count = s => s.counters.filter(c => c.from === 'Ядовитость').length;
  assert.equal(count(first.state()), 1, 'preset counter not created on load');
  // persist the state the way a real session would after any interaction, then reload from it
  first.w.eval('save()');
  const saved = first.w.localStorage.getItem(KEY);
  const second = open(saved);
  assert.deepEqual(second.errors, []);
  assert.equal(count(second.state()), 1, 'preset counter duplicated or lost after reload');
  // and from the original seed again
  const third = open(seed);
  assert.equal(count(third.state()), 1, 'preset counter not stable from original seed');
});

// ---------- 6. counters UI ----------
check('6. counters: add blank, +/- bounds, boxes with max 4, settings toggle', () => {
  const o = open();
  const { $, $$, click, change, state, errors } = o;
  change($('#addCtr'), 'blank');
  assert.equal(state().counters.length, 1, 'blank counter not added');
  assert.ok($('[data-ctrn]'), 'new counter did not open in edit mode');

  click($('[data-ctrp="0"]'));
  assert.equal(state().counters[0].v, 1, '+ did not increment');
  click($('[data-ctrm="0"]'));
  assert.equal(state().counters[0].v, 0, '− did not decrement');
  click($('[data-ctrm="0"]'));
  assert.equal(state().counters[0].v, 0, '− went below 0');

  change($('[data-ctrmax="0"]'), '4');
  assert.equal(state().counters[0].max, 4, 'max not set');
  assert.equal($$('.cboxes [data-ctrb]').length, 4, 'max 4 should render 4 boxes');
  click($('[data-ctrb="0|2"]'));
  assert.equal(state().counters[0].v, 3, 'box index 2 should set value 3');

  click($('[data-ctred]'));
  assert.equal($('[data-ctrn]'), null, 'settings did not close');
  assert.deepEqual(errors, []);
});

check('8. load off in settings hides selector, "занято" and the load column', () => {
  const on = open({ rules: { mode: 'custom', carry: true }, custom: [{ n: 'Ружьё', l: 1 }] });
  assert.ok(!on.w.document.body.classList.contains('noload'), 'load should count by default');
  const off = open({ rules: { mode: 'custom', carry: false }, custom: [{ n: 'Ружьё', l: 1 }] });
  assert.deepEqual(off.errors, []);
  assert.ok(off.w.document.body.classList.contains('noload'), 'body.noload not set');
  assert.equal(off.$('#inv .inv:not(.head) > :nth-child(5)').dataset.cusl, '0', '5th column must be the load input');
  const book = open({ rules: { mode: 'book', carry: false } });
  assert.ok(!book.w.document.body.classList.contains('noload'), '«По книге» must force load on');
});

check('9. notes: drag a card above another reorders; dropping on a pinned card pins it', () => {
  const o = open({ cards: [{ t: 'A', x: '' }, { t: 'B', x: '' }, { t: 'C', x: '' }, { t: 'P', x: '', pin: true }] });
  const doc = o.w.document;
  const fire = (type, el) => { const ev = new o.w.Event(type, { bubbles: true, cancelable: true }); ev.clientY = 0; el.dispatchEvent(ev); };
  const item = t => [...doc.querySelectorAll('#cardList [data-cardsel]')].find(b => b.querySelector('.ct').textContent === t);
  const order = () => [...doc.querySelectorAll('#cardList .ct')].map(x => x.textContent).join('');
  assert.equal(order(), 'PCBA', 'pinned first, then newest first');
  fire('dragstart', item('A')); fire('dragover', item('C')); fire('drop', item('C'));
  assert.equal(order(), 'PACB', 'A should land above C');
  fire('dragstart', item('B')); fire('drop', item('P'));
  assert.equal(order(), 'BPAC', 'B dropped above pinned P becomes pinned');
  assert.equal(o.state().cards.find(c => c.t === 'B').pin, true);
  assert.deepEqual(o.errors, []);
});

// ---------- 7. export / import round-trip ----------
check('7. export JSON -> loadRaw -> same state; storage reload keeps keys', () => {
  const o = open();
  o.click(o.$('.dot[data-a="Драка"][data-v="2"]'));
  o.change(o.$('#addTalent'), 'Врач');
  const text = o.w.eval('JSON.stringify(S,null,1)'); // what #export writes
  const exported = JSON.parse(text);
  // import path: loadRaw(file text) must give back the same state
  const viaLoadRaw = JSON.parse(o.w.eval(`JSON.stringify(loadRaw(${JSON.stringify(text)}))`));
  assert.deepEqual(Object.keys(viaLoadRaw).sort(), Object.keys(exported).sort(), 'key sets differ');
  assert.deepEqual(viaLoadRaw, exported, 'loadRaw(export) differs from export');
  // and a fresh page started from the exported text shows the same state
  const again = open(text);
  assert.deepEqual(again.errors, []);
  assert.deepEqual(again.state(), exported, 'reloaded page state differs from export');
  assert.equal(again.$$('#actions .dot.on[data-a="Драка"]').length, 2, 'Драка dots not drawn after reload');
  assert.ok(again.$('#talents').textContent.includes('Врач'), 'talent Врач not shown after reload');
});

// ---------- summary ----------
console.log('');
console.log(`${passed} checks passed` + (bugs ? `, ${bugs} BUG (known, see above)` : '') + (failed ? `, ${failed} FAILED` : ''));
process.exit(failed ? 1 : 0);

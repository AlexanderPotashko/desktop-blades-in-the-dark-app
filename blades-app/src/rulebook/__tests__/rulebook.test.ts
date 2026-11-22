import { describe, expect, it } from 'vitest';
import { cleanPages, parseTxt } from '../cleanup';
import { itemsToText, parseRulebookJs, prepareTxt } from '../sources';

// Synthetic text (not from the book). The expected values are the output of tools/mkrulebook.py on the same input.
const TXT = [
  '=====PAGE 9=====',
  'СОДЕРЖАНИЕ',
  'Первая глава.....12 Вторая глава.....20',
  '=====PAGE 10=====',
  'Основы',
  'ГЛАВА 1',
  'ВСТУПЛЕНИЕ',
  'Это первая строка с пере-',
  'несённым словом. Вторая строка',
  'продолжается тут',
  '◆ Пункт списка',
  '12',
  '=====PAGE 11=====',
  'ВСТУПЛЕНИЕ',
  'Продолжение страницы «Да»',
  'ПРАВИЛА ИГРЫ',
  'Текст раздела:',
  'Новый абзац.',
  '=====PAGE 12=====',
  'Команда',
  'ПРАВИЛА ИГРЫ',
  'Ещё текст  с  пробелами',
  '',
].join('\n');

describe('cleanup (port of mkrulebook.py)', () => {
  it('splits pages on markers', () => {
    expect(parseTxt(TXT).map((p) => p.pdf)).toEqual([9, 10, 11, 12]);
  });

  it('matches the python output', () => {
    const { pages, toc } = cleanPages(parseTxt(TXT));
    expect(pages.map((p) => p.text)).toEqual([
      '## СОДЕРЖАНИЕ\nПервая глава.....12\nВторая глава.....20', // printed contents: one entry per line
      '## ГЛАВА 1\n## ВСТУПЛЕНИЕ\nЭто первая строка с перенесённым словом. Вторая строка продолжается тут\n◆ Пункт списка',
      'Продолжение страницы «Да»\n## ПРАВИЛА ИГРЫ\nТекст раздела:\nНовый абзац.', // repeated head dropped
      'Ещё текст с пробелами', // running chapter title and repeated head dropped, spaces collapsed
    ]);
    expect(toc).toEqual([
      { title: 'Глава 1', pdf: 10, level: 1 },
      { title: 'Вступление', pdf: 10, level: 2 },
      { title: 'Правила игры', pdf: 11, level: 2 },
    ]); // nothing from pages < 10
  });

  it('applies the book offset to pages and TOC', () => {
    const { pages, toc } = prepareTxt(TXT, 5);
    expect(pages.map((p) => [p.pdf, p.book])).toEqual([[9, 4], [10, 5], [11, 6], [12, 7]]);
    expect(toc[0]).toEqual({ title: 'Глава 1', page: 5, level: 1 });
  });

  it('adds the next heading to a chapter title', () => {
    const { toc } = cleanPages([{ pdf: 20, text: 'ГЛАВА 2\nМистика и магия\nтекст' }]);
    expect(toc[0].title).toBe('Глава 2 — Мистика и магия');
  });
});

describe('rulebook.js parser', () => {
  const js =
    '// comment line\nwindow.RULEBOOK={"pages":[{"p":10,"b":5,"t":"текст <b>x</b>"},{"p":11,"b":6,"t":"ещё"}],"toc":[{"h":"Глава","p":11,"lvl":1}]};\n';
  it('reads pages and maps TOC pdf pages to book pages', () => {
    expect(parseRulebookJs(js)).toEqual({
      pages: [
        { pdf: 10, book: 5, text: 'текст <b>x</b>' },
        { pdf: 11, book: 6, text: 'ещё' },
      ],
      toc: [{ title: 'Глава', page: 6, level: 1 }],
    });
  });
  it('rejects other content without evaluating it', () => {
    expect(() => parseRulebookJs('alert(1)')).toThrow();
    expect(() => parseRulebookJs('window.RULEBOOK=alert(1);')).toThrow();
  });
});

describe('pdf text items', () => {
  it('breaks lines on y change and EOL', () => {
    const it = (str: string, y: number, hasEOL = false) => ({ str, transform: [1, 0, 0, 1, 0, y], hasEOL });
    expect(itemsToText([it('Ab', 700), it('c', 700), it('de', 688), it('fg', 676, true), it('h', 664)])).toBe('Abc\nde\nfg\nh');
  });
});

// Port of tools/mkrulebook.py (keep the two in step): raw per-page text -> clean paragraphs + table of contents.
// Pure functions; the rulebook text itself never lives in this repo.

export interface RawPage {
  /** PDF page number */
  pdf: number;
  text: string;
}
export interface TocItem {
  title: string;
  /** PDF page number; callers convert to the book page */
  pdf: number;
  level: number;
}

const HEAD = /^[А-ЯЁ][А-ЯЁ ,\-—:«»()0-9]{4,60}$/;
const PAGE_NO = /^\d{1,3}$/;
/** Running chapter titles printed at the top of every page. */
const RUNNING = new Set([
  'Основы',
  'Персонажи',
  'Команда',
  'Дело',
  'Передышка',
  'Как играть',
  'Как вести игру',
  'Мистические силы',
  'Изменения в игре',
  'Город мрака',
  'Игровой мир',
]);

/** Python `str.capitalize()`. */
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** `rulebook.txt`: pages separated by `=====PAGE N=====` (N = PDF page). */
export function parseTxt(raw: string): RawPage[] {
  const parts = raw.split(/\n?=====PAGE (\d+)=====\n/);
  const pages: RawPage[] = [];
  for (let i = 1; i < parts.length; i += 2) pages.push({ pdf: Number(parts[i]), text: parts[i + 1] ?? '' });
  return pages;
}

export function cleanPages(raw: RawPage[]): { pages: RawPage[]; toc: TocItem[] } {
  const pages: RawPage[] = [];
  const toc: TocItem[] = [];
  let lastH: string | null = null;
  let prevHeads = new Set<string>();
  for (const { pdf, text: body } of raw) {
    const lines = body.split('\n').map((l) => l.replace(/\s+$/, ''));
    const out: string[] = [];
    const heads = new Set<string>();
    lines.forEach((l, li) => {
      const st = l.trim();
      if (!st) return;
      if (PAGE_NO.test(st)) return; // running page numbers / chapter digits
      if (li < 4 && RUNNING.has(st)) return; // running chapter title
      if (HEAD.test(st) && !out.length && prevHeads.has(st)) {
        heads.add(st); // running section head repeated from the previous page
        return;
      }
      if (HEAD.test(st)) {
        heads.add(st);
        const recent = toc.slice(-4).map((t) => t.title.toUpperCase());
        if (st !== lastH && !recent.includes(st.toUpperCase()) && st !== 'СОДЕРЖАНИЕ') {
          const level = st.startsWith('ГЛАВА') ? 1 : 2;
          let title = capitalize(st);
          if (level === 1) {
            const nxt = lines.slice(li + 1).map((x) => x.trim()).find((x) => x && !PAGE_NO.test(x)) ?? '';
            title = capitalize(st) + (nxt && !HEAD.test(nxt) ? ' — ' + capitalize(nxt) : '');
          }
          if (pdf >= 10) toc.push({ title, pdf, level }); // skip front matter and the printed contents pages
          lastH = st;
        }
        out.push('\n## ' + st + '\n');
        return;
      }
      if (out.length && !out[out.length - 1].endsWith('\n')) {
        const prev = out[out.length - 1];
        if (/[-‑­]$/.test(prev) && /^[а-яё]/.test(st)) {
          out[out.length - 1] = prev.slice(0, -1) + st; // hyphenated word across lines
          return;
        }
        if (st.startsWith('◆') || (/[.!?:»)]$/.test(prev) && /^[А-ЯЁ«◆0-9]/.test(st))) {
          out.push('\n' + st);
          return;
        }
        out[out.length - 1] = prev + ' ' + st;
        return;
      }
      out.push(st);
    });
    let text = out.join('').replace(/\n{2,}/g, '\n').trim();
    text = text.replace(/[  ]{2,}/g, ' ');
    // printed contents pages: one entry per line («Название.....12»)
    text = text.replace(/(\.{2,}[\s.]*\d{1,3})\s+(?=[А-ЯЁA-Z])/g, '$1\n');
    prevHeads = heads;
    pages.push({ pdf, text });
  }
  return { pages, toc };
}

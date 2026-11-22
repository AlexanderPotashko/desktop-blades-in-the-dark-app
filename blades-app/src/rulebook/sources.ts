// Turns the three import sources into one shape for rb_import_pages. No eval, no network.
import { cleanPages, parseTxt, type RawPage } from './cleanup';

export interface ImportPage {
  pdf: number;
  book: number;
  text: string;
}
export interface TocEntry {
  title: string;
  /** book page */
  page: number;
  level: number;
}
export interface Prepared {
  pages: ImportPage[];
  toc: TocEntry[];
}

/** book = pdf - offset (the Russian edition: offset 5). */
export function prepareRaw(raw: RawPage[], offset: number): Prepared {
  const { pages, toc } = cleanPages(raw);
  return {
    pages: pages.map((p) => ({ pdf: p.pdf, book: p.pdf - offset, text: p.text })),
    toc: toc.map((e) => ({ title: e.title, page: e.pdf - offset, level: e.level })),
  };
}

/** `rulebook.txt` with `=====PAGE N=====` markers. */
export const prepareTxt = (text: string, offset: number) => prepareRaw(parseTxt(text), offset);

/**
 * The prototype's `rulebook.js`: `window.RULEBOOK={"pages":[{p,b,t}],"toc":[{h,p,lvl}]};` (JSON after the assignment).
 * Already cleaned, so no cleanup and no offset: `b` is the book page. A TOC page `p` is a PDF page.
 */
export function parseRulebookJs(src: string): Prepared {
  const m = /window\.RULEBOOK\s*=\s*/.exec(src);
  if (!m) throw new Error('not a rulebook.js file');
  const json = src.slice(m.index + m[0].length).trim().replace(/;$/, '');
  const data = JSON.parse(json) as { pages?: { p: number; b: number; t: string }[]; toc?: { h: string; p: number; lvl: number }[] };
  if (!Array.isArray(data.pages)) throw new Error('rulebook.js has no pages');
  const pages = data.pages.map((x) => ({ pdf: Number(x.p), book: Number(x.b), text: String(x.t) }));
  const bookOf = new Map(pages.map((p) => [p.pdf, p.book]));
  const toc = (data.toc ?? []).map((e) => ({ title: String(e.h), page: bookOf.get(e.p) ?? e.p, level: Number(e.lvl) }));
  return { pages, toc };
}

interface PdfTextItem {
  str: string;
  transform: number[];
  hasEOL?: boolean;
}

/** pdf.js text items of one page -> lines (a new line when y changes or the item ends a line). */
export function itemsToText(items: PdfTextItem[]): string {
  let out = '';
  let y: number | null = null;
  for (const it of items) {
    const iy = it.transform?.[5];
    if (y !== null && iy !== undefined && Math.abs(iy - y) > 2 && !out.endsWith('\n')) out += '\n';
    out += it.str;
    if (it.hasEOL) out += '\n';
    if (iy !== undefined) y = iy;
  }
  return out;
}

/** Reads every page of a PDF in the window with pdf.js (loaded on demand). */
export async function extractPdf(bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<RawPage[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const pages: RawPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ pdf: n, text: itemsToText(content.items.filter((i): i is typeof i & PdfTextItem => 'str' in i)) });
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

export async function preparePdf(bytes: Uint8Array, offset: number, onProgress?: (done: number, total: number) => void) {
  return prepareRaw(await extractPdf(bytes, onProgress), offset);
}

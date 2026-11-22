// The "Рулбук" tab: import, ranked search with highlighted snippets, page reader, TOC, bookmarks.
// All rulebook text is rendered as text (React escapes it), never as HTML.
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import * as api from '../api/rulebook';
import type { RbBookmark, RbHit, RbPage, RbTocEntry, RulebookInfo } from '../api/rulebook';
import { preparePdf, parseRulebookJs, prepareTxt, type Prepared } from './sources';
import { subscribeOpenBookPage, takePendingPage } from './nav';
import './rulebook.css';

export { openBookPage, subscribeOpenBookPage } from './nav';

const SOURCES = { pdf: ['pdf'], js: ['js'], txt: ['txt'] } as const;
type Source = keyof typeof SOURCES;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('Blades in the Dark');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [offset, setOffset] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(kind: Source) {
    setErr(null);
    try {
      const bytes = await api.pickSource([...SOURCES[kind]]);
      if (!bytes) return;
      setBusy(t('rb.importing'));
      let prepared: Prepared;
      if (kind === 'pdf') prepared = await preparePdf(bytes, offset, (d, n) => setBusy(`${t('rb.importing')} ${d}/${n}`));
      else {
        const text = new TextDecoder().decode(bytes);
        prepared = kind === 'js' ? parseRulebookJs(text) : prepareTxt(text, offset);
      }
      await api.importPages(title.trim(), lang, prepared.pages, prepared.toc);
      onDone();
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rb-import">
      <p>{t('rb.noRulebook')}</p>
      <p className="rb-muted">{t('rb.private')}</p>
      <label>
        {t('rb.titleLabel')} <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        {t('rb.lang')}{' '}
        <select value={lang} onChange={(e) => setLang(e.target.value as 'ru' | 'en')}>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        {t('rb.offset')} <input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
      </label>
      <div className="rb-row">
        {(Object.keys(SOURCES) as Source[]).map((k) => (
          <button key={k} disabled={!!busy || !title.trim()} onClick={() => run(k)}>
            {t(`rb.import.${k}` as 'rb.import.pdf')}
          </button>
        ))}
      </div>
      {busy && <p>{busy}</p>}
      {err && <p className="rb-error">{err}</p>}
    </div>
  );
}

export function RulebookView() {
  const [books, setBooks] = useState<RulebookInfo[] | null>(null);
  const [toc, setToc] = useState<RbTocEntry[]>([]);
  const [marks, setMarks] = useState<RbBookmark[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RbHit[] | null>(null);
  const [page, setPage] = useState<RbPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    try {
      const b = await api.listRulebooks();
      setBooks(b);
      if (b.length) {
        setToc(await api.getToc());
        setMarks(await api.listBookmarks());
      } else {
        setToc([]);
        setMarks([]);
        setPage(null);
        setHits(null);
      }
    } catch (e) {
      setErr(msg(e));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const showBook = useCallback(async (book: number) => {
    try {
      setErr(null);
      setPage(await api.getPageByBook(book));
    } catch (e) {
      setErr(msg(e));
    }
  }, []);
  const showPdf = useCallback(async (pdf: number) => {
    try {
      setErr(null);
      setPage(await api.getPage(pdf));
    } catch (e) {
      setErr(msg(e));
    }
  }, []);

  // "p. N" requests from elsewhere in the app
  const hasBooks = !!books?.length;
  useEffect(() => {
    if (!hasBooks) return;
    const take = () => {
      const r = takePendingPage();
      if (r) void showBook(r.book);
    };
    take();
    return subscribeOpenBookPage(take);
  }, [hasBooks, showBook]);

  // debounced search; a stale answer never overwrites a newer one
  useEffect(() => {
    const q = query.trim();
    if (!q || !hasBooks) return setHits(null);
    const n = ++seq.current;
    const h = setTimeout(() => {
      api.search(q).then(
        (r) => n === seq.current && setHits(r),
        (e) => n === seq.current && setErr(msg(e)),
      );
    }, 150);
    return () => clearTimeout(h);
  }, [query, hasBooks]);

  async function remove(b: RulebookInfo) {
    if (!window.confirm(t('rb.deleteConfirm', { title: b.title }))) return;
    try {
      await api.deleteRulebook(b.id);
      await reload();
    } catch (e) {
      setErr(msg(e));
    }
  }

  if (books === null) return <div className="rb">{err && <p className="rb-error">{err}</p>}</div>;
  if (!books.length) return <div className="rb"><ImportPanel onDone={reload} />{err && <p className="rb-error">{err}</p>}</div>;

  const mark = marks.find((m) => page && m.page === page.book);
  return (
    <div className="rb">
      <aside className="rb-side">
        <h3>{t('rb.toc')}</h3>
        <ul>
          {toc.map((e, i) => (
            <li key={i} className={`lvl${e.level}`}>
              <button className="rb-link" onClick={() => void showBook(e.page)}>
                {e.title}
              </button>
            </li>
          ))}
        </ul>
        <h3>{t('rb.bookmarks')}</h3>
        <ul>
          {marks.map((m) => (
            <li key={m.id}>
              <button className="rb-link" onClick={() => void showBook(m.page)}>
                {t('rb.page', { n: m.page })} {m.title}
              </button>{' '}
              <button title={t('rb.bookmarkRemove')} aria-label={t('rb.bookmarkRemove')} onClick={() => api.deleteBookmark(m.id).then(reload, (e) => setErr(msg(e)))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <p className="rb-muted">
          {books[0].title} · {t('rb.pages', { n: books[0].pages })}{' '}
          <button onClick={() => void remove(books[0])}>{t('rb.delete')}</button>
        </p>
      </aside>
      <section className="rb-main">
        <input
          type="search"
          className="rb-search"
          placeholder={t('rb.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {err && <p className="rb-error">{err}</p>}
        {hits && (
          <div className="rb-hits">
            <p className="rb-muted">{hits.length ? t('rb.hits', { n: hits.length }) : t('rb.noHits')}</p>
            {hits.map((h) => (
              <div key={h.pdf} className="rb-hit">
                <button className="rb-link" onClick={() => void showPdf(h.pdf)}>
                  {t('rb.page', { n: h.book })}
                </button>{' '}
                {h.snippet.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
              </div>
            ))}
          </div>
        )}
        {page && (
          <article className="rb-page">
            <header className="rb-row">
              <button disabled={page.pdf <= 1} onClick={() => void showPdf(page.pdf - 1)}>
                {t('rb.prev')}
              </button>
              <strong>{t('rb.page', { n: page.book })}</strong>
              <button onClick={() => void showPdf(page.pdf + 1)}>{t('rb.next')}</button>
              {mark ? (
                <button onClick={() => api.deleteBookmark(mark.id).then(reload, (e) => setErr(msg(e)))}>{t('rb.bookmarkRemove')}</button>
              ) : (
                <button onClick={() => api.addBookmark(page.book, '').then(reload, (e) => setErr(msg(e)))}>{t('rb.bookmarkAdd')}</button>
              )}
            </header>
            <div className="rb-text">{page.text}</div>
          </article>
        )}
      </section>
    </div>
  );
}

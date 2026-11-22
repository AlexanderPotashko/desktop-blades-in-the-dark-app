// "As it was yesterday": revisions of one sheet, a preview, and a rollback that first saves the current state.
import { useEffect, useState } from 'react';
import * as db from '../../api/db';
import { loadCharacter } from '../../engine/migrate';
import { t, type Key } from '../../i18n';
import type { Character } from '../../model';
import { restoreRevision } from '../../store/library';
import { bookName } from '../../store/content';
import { Confirm, errText, fmtDate, Msg } from './parts';

const REASONS = ['autosave', 'close', 'switch', 'before-restore', 'before-import'];
export const reasonLabel = (r: string) => (REASONS.includes(r) ? t(`history.reason.${r}` as Key) : r);

function Summary({ d, now }: { d: Character; now?: Character }) {
  const dots = (c: Character) => Object.values(c.actions).reduce((a, b) => a + b, 0);
  const rows: Array<[string, string | number, string | number | undefined]> = [
    [t('name'), d.name, now?.name],
    [t('alias'), d.alias, now?.alias],
    [t('history.skills'), dots(d), now && dots(now)],
    [t('history.talents'), d.talents.length + d.customTalents.length, now && now.talents.length + now.customTalents.length],
    [t('history.items'), d.items.length, now?.items.length],
    [t('stress'), d.stress, now?.stress],
    [t('history.notes'), d.cards.length, now?.cards.length],
  ];
  return (
    <table className="lib-table" data-testid="rev-preview">
      <thead><tr><th /><th>{t('history.then')}</th><th>{t('history.now')}</th></tr></thead>
      <tbody>
        {rows.map(([k, a, b]) => (
          <tr key={k} className={b !== undefined && a !== b ? 'diff' : ''}><td>{k}</td><td>{a || '—'}</td><td>{b || '—'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function History({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [revs, setRevs] = useState<db.RevisionRow[]>([]);
  const [sel, setSel] = useState<number>();
  const [doc, setDoc] = useState<Character>();
  const [now, setNow] = useState<Character>();
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void db.listRevisions(id).then(setRevs).catch((e) => setMsg(errText(e)));
    void db.getCharacter(id).then(setNow).catch(() => setNow(undefined));
  }, [id]);
  useEffect(() => {
    setDoc(undefined);
    if (sel === undefined) return;
    void db.getRevision(sel).then((r) => loadCharacter(r.doc)).then(setDoc).catch((e) => setMsg(errText(e)));
  }, [sel]);

  const restore = async () => {
    if (sel === undefined) return;
    try {
      await restoreRevision(id, sel);
      setMsg(t('history.restored'));
      setRevs(await db.listRevisions(id));
      setNow(await db.getCharacter(id));
      onChanged();
    } catch (e) {
      setMsg(errText(e));
    }
  };

  return (
    <section data-testid="history">
      <h2>{t('history')} {now ? `— ${now.name || t('library.unnamed')}` : ''}</h2>
      <div className="row"><button onClick={onClose}>{t('close')}</button></div>
      <div className="small">{t('history.hint')}</div>
      {!revs.length && <p className="small">{t('history.empty')}</p>}
      <div className="rev-grid">
        <ul className="rev-list" aria-label={t('history')}>
          {revs.map((r) => (
            <li key={r.id}>
              <button className={sel === r.id ? 'on' : ''} onClick={() => setSel(r.id)} data-testid="rev">
                {fmtDate(r.createdAt)} <span className="small">· {reasonLabel(r.reason)}</span>
              </button>
            </li>
          ))}
        </ul>
        {doc && (
          <div>
            <div className="small">{bookName(doc.playbookId)}</div>
            <Summary d={doc} now={now} />
            <Confirm label={t('history.restore')} ask={t('history.restoreAsk')} onYes={restore} />
          </div>
        )}
      </div>
      <Msg>{msg}</Msg>
    </section>
  );
}

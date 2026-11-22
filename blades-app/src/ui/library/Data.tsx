// Export / import of .blades.json and backups. The rulebook is never exported (copyright).
import { useCallback, useEffect, useState } from 'react';
import * as db from '../../api/db';
import { pickImport } from '../../api/exchange';
import { parseBackupName, type Bundle } from '../../engine/exchange';
import { t, type Key } from '../../i18n';
import { applyImport, exportTo, parseImport, previewImport, restoreFromBackup, type Preview } from '../../store/library';
import { Confirm, errText, fmtDate, Msg } from './parts';

const REASONS = ['daily', 'manual', 'pre-restore', 'pre-delete', 'pre-migrate', 'pre-import', 'pre-rulebook'];

function ImportBox({ onDone }: { onDone: () => void }) {
  const [bundle, setBundle] = useState<Bundle>();
  const [prev, setPrev] = useState<Preview>();
  const [mode, setMode] = useState<'copy' | 'replace'>('copy');
  const [msg, setMsg] = useState('');

  const pick = async () => {
    try {
      const text = await pickImport();
      if (text === null) return;
      const b = await parseImport(text);
      setBundle(b);
      setPrev(await previewImport(b));
      setMsg('');
    } catch (e) {
      setBundle(undefined);
      setPrev(undefined);
      setMsg(t('data.importFailed', { error: errText(e) }));
    }
  };
  const apply = async () => {
    if (!bundle) return;
    try {
      const r = await applyImport(bundle, mode);
      setMsg(t('data.imported', { added: r.added, replaced: r.replaced, copied: r.copied, unchanged: r.unchanged, rulings: r.rulings }));
      setBundle(undefined);
      setPrev(undefined);
      onDone();
    } catch (e) {
      setMsg(t('data.importFailed', { error: errText(e) }));
    }
  };
  const conflicts = prev ? prev.characters.filter((c) => c.status === 'conflict').length + prev.campaigns.filter((c) => c.status === 'conflict').length : 0;

  return (
    <>
      <div className="row"><button onClick={() => void pick()}>{t('data.import')}</button></div>
      <div className="small">{t('data.importHint')}</div>
      {prev && (
        <div className="preview" data-testid="import-preview">
          <ul>
            {prev.campaigns.map((c) => <li key={c.id}>{t('campaign')}: {c.name} <span className={`st ${c.status}`}>{t(`data.status.${c.status}` as Key)}</span></li>)}
            {prev.characters.map((c) => (
              <li key={c.id}>
                {c.name || t('library.unnamed')} <span className={`st ${c.status}`}>{t(`data.status.${c.status}` as Key)}</span>
                {c.status === 'conflict' && <span className="small"> ({t('data.dates', { incoming: fmtDate(c.incomingAt) || '?', existing: fmtDate(c.existingAt) })})</span>}
              </li>
            ))}
            {prev.rulings > 0 && <li>{t('rulings')}: {prev.rulings}</li>}
          </ul>
          {prev.warnings.length > 0 && <div className="small warn">{t('data.warnings', { n: prev.warnings.length })}</div>}
          {conflicts > 0 && (
            <div className="row" data-testid="conflict-mode">
              <label className="chk"><input type="radio" name="conflict" checked={mode === 'copy'} onChange={() => setMode('copy')} /> {t('data.keepBoth')}</label>
              <label className="chk"><input type="radio" name="conflict" checked={mode === 'replace'} onChange={() => setMode('replace')} /> {t('data.replace')}</label>
            </div>
          )}
          <div className="row">
            <button onClick={() => void apply()} data-testid="import-apply">{t('data.apply')}</button>
            <button onClick={() => { setBundle(undefined); setPrev(undefined); }}>{t('cancel')}</button>
          </div>
        </div>
      )}
      <Msg>{msg}</Msg>
    </>
  );
}

function Backups({ onRestored }: { onRestored: () => void }) {
  const [list, setList] = useState<db.BackupInfo[]>([]);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => db.listBackups().then((l) => setList([...l].reverse())).catch((e) => setMsg(errText(e))), []);
  useEffect(() => void load(), [load]);

  return (
    <>
      <h3>{t('backups')}</h3>
      <div className="small">{t('backups.hint')}</div>
      <div className="row">
        <button onClick={() => void db.backupNow().then(() => { setMsg(t('backups.made')); return load(); }).catch((e) => setMsg(errText(e)))}>{t('backups.now')}</button>
      </div>
      {!list.length && <p className="small">{t('backups.empty')}</p>}
      <table className="lib-table" data-testid="backups">
        <tbody>
          {list.map((b) => {
            const { at, reason } = parseBackupName(b.name);
            return (
              <tr key={b.name}>
                <td>{fmtDate(at) || b.name}</td>
                <td className="small">{REASONS.includes(reason) ? t(`backups.reason.${reason}` as Key) : reason}</td>
                <td className="small">{Math.max(1, Math.round(b.size / 1024))} KB</td>
                <td>
                  <Confirm label={t('backups.restore')} ask={t('backups.restoreAsk')}
                    onYes={() => restoreFromBackup(b.name).then(() => { setMsg(t('backups.restored')); onRestored(); return load(); }).catch((e) => setMsg(errText(e)))} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Msg>{msg}</Msg>
    </>
  );
}

export function Data({ onChanged }: { onChanged: () => void }) {
  const [msg, setMsg] = useState('');
  return (
    <section data-testid="data">
      <h2>{t('data')}</h2>
      <div className="row">
        <button onClick={() => void exportTo('library').then((ok) => setMsg(ok ? t('data.exported') : '')).catch((e) => setMsg(errText(e)))}>{t('data.exportLibrary')}</button>
      </div>
      <div className="small">{t('data.exportHint')}</div>
      <Msg>{msg}</Msg>
      <ImportBox onDone={onChanged} />
      <Backups onRestored={onChanged} />
    </section>
  );
}

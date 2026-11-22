// Library screen: all sheets (search, archive, duplicate, delete, history, export), campaigns, import/export, backups.
import { useCallback, useEffect, useState } from 'react';
import * as db from '../../api/db';
import { t } from '../../i18n';
import { bookName } from '../../store/content';
import { createCampaign, duplicateCharacter, exportTo, openCharacter, removeCharacter, setArchived } from '../../store/library';
import { CampaignView } from './Campaigns';
import { Data } from './Data';
import { History } from './History';
import { startNewCharacter } from './newCharacter';
import { Confirm, errText, fmtDate, Msg } from './parts';
import './library.css';

export function Library() {
  const [rows, setRows] = useState<db.CharacterRow[]>([]);
  const [camps, setCamps] = useState<db.CampaignRow[]>([]);
  const [q, setQ] = useState('');
  const [archived, setArchivedShown] = useState(false);
  const [history, setHistory] = useState<string>();
  const [campId, setCampId] = useState<string>();
  const [newCamp, setNewCamp] = useState('');
  const [msg, setMsg] = useState('');

  const reload = useCallback(async () => {
    try {
      setRows(await db.listCharacters(true));
      setCamps(await db.listCampaigns());
    } catch (e) {
      setMsg(errText(e));
    }
  }, []);
  useEffect(() => void reload(), [reload]);
  const run = (fn: () => Promise<unknown>) => async () => {
    try {
      setMsg('');
      await fn();
    } catch (e) {
      setMsg(errText(e));
    }
    await reload();
  };

  const campName = (id: string | null) => camps.find((c) => c.id === id)?.name ?? '';
  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => (archived || !r.archived) && (!needle || [r.name, r.alias, campName(r.campaignId), bookName(r.playbook ?? '')].some((x) => (x ?? '').toLowerCase().includes(needle))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const camp = camps.find((c) => c.id === campId);
  const hasArchived = rows.some((r) => r.archived);

  return (
    <main id="library">
      <section className="wide" data-testid="characters">
        <h2>{t('library')}</h2>
        <div className="row">
          <input type="search" aria-label={t('library.search')} placeholder={t('library.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
          <label className="chk"><input type="checkbox" checked={archived} onChange={(e) => setArchivedShown(e.target.checked)} /> {t('library.showArchived')}{hasArchived ? '' : ' (0)'}</label>
          <button className="primary" onClick={run(startNewCharacter)} data-testid="new-character">{t('library.new')}</button>
        </div>
        {!shown.length && <p className="small">{t('library.empty')}</p>}
        <table className="lib-table">
          <thead>
            <tr><th>{t('name')}</th><th>{t('library.playbook')}</th><th>{t('campaign')}</th><th>{t('library.updated')}</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.archived ? 'archived' : ''} data-testid="char-row" data-id={r.id}>
                <td>
                  <b>{r.name || t('library.unnamed')}</b>
                  {r.alias ? <span className="small"> «{r.alias}»</span> : null}
                  {r.archived ? <span className="small"> · {t('library.archived')}</span> : null}
                </td>
                <td>{bookName(r.playbook ?? '')}</td>
                <td>{campName(r.campaignId)}</td>
                <td className="small">{fmtDate(r.updatedAt)}</td>
                <td className="acts">
                  <button onClick={run(() => openCharacter(r.id))} data-act="open">{t('library.open')}</button>
                  <button onClick={run(() => duplicateCharacter(r.id))} data-act="dup">{t('library.duplicate')}</button>
                  <button onClick={run(() => setArchived(r.id, !r.archived))} data-act="archive">{t(r.archived ? 'library.unarchive' : 'library.archive')}</button>
                  <button onClick={() => { setCampId(undefined); setHistory(r.id); }} data-act="history">{t('history')}</button>
                  <button onClick={run(() => exportTo('character', r.id).then((ok) => setMsg(ok ? t('data.exported') : '')))} data-act="export">{t('library.export')}</button>
                  <Confirm danger label={t('library.delete')} ask={t('library.deleteAsk', { name: r.name || t('library.unnamed') })} onYes={run(() => removeCharacter(r.id))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Msg>{msg}</Msg>
      </section>

      <section data-testid="campaigns">
        <h2>{t('campaigns')}</h2>
        {!camps.length && <p className="small">{t('campaigns.empty')}</p>}
        <ul className="camp-list">
          {camps.map((c) => (
            <li key={c.id}>
              <button className={campId === c.id ? 'on' : ''} onClick={() => { setHistory(undefined); setCampId(c.id); }} data-testid="camp-open">
                {c.name} <span className="small">· {t('campaign.count', { n: rows.filter((r) => r.campaignId === c.id).length })}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input aria-label={t('campaign.name')} placeholder={t('campaign.name')} value={newCamp} onChange={(e) => setNewCamp(e.target.value)} style={{ maxWidth: 220 }} />
          <button disabled={!newCamp.trim()} data-testid="camp-create" onClick={run(async () => { setCampId(await createCampaign(newCamp.trim())); setHistory(undefined); setNewCamp(''); })}>{t('campaign.create')}</button>
        </div>
      </section>

      <Data onChanged={() => void reload()} />

      {history && <History id={history} onClose={() => setHistory(undefined)} onChanged={() => void reload()} />}
      {camp && (
        <CampaignView camp={camp} members={rows.filter((r) => r.campaignId === camp.id)} others={rows.filter((r) => !r.archived && r.campaignId !== camp.id)}
          onClose={() => setCampId(undefined)} onChanged={() => void reload()} />
      )}
    </main>
  );
}

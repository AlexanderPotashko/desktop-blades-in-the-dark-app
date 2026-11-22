// One campaign: name, members, the table's rules, the GM's rulings log (verbatim quotes), delete, export.
import { useCallback, useEffect, useState } from 'react';
import * as db from '../../api/db';
import { t } from '../../i18n';
import type { Ruling } from '../../model';
import { addRuling, exportTo, matchesRuling, removeCampaign, renameCampaign, saveCampaignRules, setMember } from '../../store/library';
import { RulesEditor, type SetRule } from '../RulesEditor';
import { Confirm, errText, Msg } from './parts';

const today = () => new Date().toISOString().slice(0, 10);

function Rulings({ campaignId }: { campaignId: string }) {
  const [list, setList] = useState<Ruling[]>([]);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ date: today(), author: '', quote: '', topic: '' });
  const [msg, setMsg] = useState('');
  const load = useCallback(() => db.listRulings(campaignId).then(setList).catch((e) => setMsg(errText(e))), [campaignId]);
  useEffect(() => void load(), [load]);

  const add = async () => {
    try {
      await addRuling(campaignId, f);
      setF({ ...f, quote: '', topic: '' });
      setMsg('');
      await load();
    } catch (e) {
      setMsg(errText(e));
    }
  };
  const shown = list.filter((r) => matchesRuling(r, q)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <h3>{t('rulings')}</h3>
      <div className="small">{t('rulings.hint')}</div>
      <div className="ruling-form" data-testid="ruling-form">
        <input type="date" aria-label={t('rulings.date')} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input aria-label={t('rulings.author')} placeholder={t('rulings.author')} value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
        <input aria-label={t('rulings.topic')} placeholder={t('rulings.topic')} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
        <textarea aria-label={t('rulings.quote')} placeholder={t('rulings.quote')} value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} />
        <button onClick={() => void add()} disabled={!f.author.trim() || !f.quote.trim() || !f.date}>{t('rulings.add')}</button>
      </div>
      <Msg>{msg}</Msg>
      <input type="search" aria-label={t('rulings.search')} placeholder={t('rulings.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {!list.length && <p className="small">{t('rulings.empty')}</p>}
      <ul className="rulings" data-testid="rulings">
        {shown.map((r) => (
          <li key={r.id}>
            <div className="small">{r.date} · {r.author}{r.topic ? ` · ${r.topic}` : ''}</div>
            <blockquote>{r.quote}</blockquote>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CampaignView({ camp, members, others, onClose, onChanged }: {
  camp: db.CampaignRow;
  members: db.CharacterRow[];
  others: db.CharacterRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [c, setC] = useState(camp);
  const [name, setName] = useState(camp.name);
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { setC(camp); setName(camp.name); }, [camp]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setMsg('');
      onChanged();
    } catch (e) {
      setMsg(errText(e));
    }
  };
  const setRule: SetRule = (k, v) => {
    const rules = { ...c.rules, [k]: v };
    setC({ ...c, rules });
    void run(() => saveCampaignRules({ id: c.id, name: c.name, rules }, rules));
  };

  return (
    <section data-testid="campaign">
      <h2>{t('campaign')}</h2>
      <div className="row">
        <input aria-label={t('campaign.name')} value={name} style={{ width: 260 }} onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== c.name && void run(() => renameCampaign({ id: c.id, name: name.trim(), rules: c.rules }, name.trim()))} />
        <button onClick={() => void run(() => exportTo('campaign', c.id).then((ok) => setMsg(ok ? t('data.exported') : '')))}>{t('campaign.export')}</button>
        <button onClick={onClose}>{t('close')}</button>
      </div>

      <h3>{t('campaign.members')}</h3>
      {!members.length && <p className="small">{t('campaign.noMembers')}</p>}
      <ul className="members">
        {members.map((m) => (
          <li key={m.id} className="row">
            <span>{m.name || t('library.unnamed')}</span>
            <button className="mini" onClick={() => void run(() => setMember(m.id, null))}>{t('campaign.leave')}</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <select aria-label={t('campaign.addMember')} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{t('campaign.addMember')}</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name || t('library.unnamed')}</option>)}
        </select>
        <button disabled={!pick} onClick={() => void run(() => setMember(pick, c.id).then(() => setPick('')))}>{t('campaign.add')}</button>
      </div>
      <div className="small">{t('campaign.leaveHint')}</div>

      <RulesEditor r={c.rules} set={setRule} name={`camp-mode-${c.id}`} />
      <div className="small">{t('campaign.rulesHint')}</div>

      <Rulings campaignId={c.id} />

      <h3>{t('campaign.delete')}</h3>
      <div className="small">{t('campaign.deleteHint')}</div>
      <Confirm danger label={t('campaign.delete')} ask={t('campaign.deleteAsk')} onYes={() => run(async () => { await removeCampaign(c.id); onClose(); })} />
      <Msg>{msg}</Msg>
    </section>
  );
}

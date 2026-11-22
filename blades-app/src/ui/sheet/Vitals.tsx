import { useState } from 'react';
import { stressMax } from '../../engine/stress';
import { talentMods } from '../../engine/talents';
import { t } from '../../i18n';
import { bookName, bookText, commonContent, playbooks, talentDefs } from '../../store/content';
import { addCustomTrauma, removeCustomTrauma, setHarm, setHealing, setStress, toggleTrauma } from '../../store/actions';
import { useRules, useStore } from '../../store/store';
import { Boxes, Clock, tip } from '../widgets';

function Traumas() {
  const doc = useStore((s) => s.doc)!;
  const [draft, setDraft] = useState('');
  const add = () => {
    addCustomTrauma(draft);
    setDraft('');
  };
  const row = (id: string, name: string, text: string, custom: boolean) => (
    <label key={id} className="row trauma" style={{ margin: '0 8px 0 0', color: 'var(--ink)' }} title={text}>
      <input type="checkbox" checked={doc.trauma.includes(id)} onChange={() => toggleTrauma(id)} />
      {name}
      {custom && <button className="mini" onClick={() => removeCustomTrauma(id)} title={t('remove')} aria-label={t('remove')}>✕</button>}
    </label>
  );
  return (
    <>
      <label>{t('trauma.label')}{doc.trauma.length >= 4 && <span className="warn"> · {t('trauma.retire')}</span>}</label>
      <div className="row" data-testid="traumas">
        {commonContent.traumas.map((x) => row(x.id, bookName(x.id), bookText(x.id), false))}
        {doc.customTraumas.map((c) => row(c.id, c.name, c.text, true))}
        <input value={draft} placeholder={t('trauma.custom')} style={{ width: 140 }} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="mini" onClick={add} disabled={!draft.trim()}>+</button>
      </div>
    </>
  );
}

export function Vitals() {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  const max = stressMax(rules, talentMods(doc, talentDefs), playbooks[doc.playbookId]?.stressBoxes);
  const full = doc.stress >= max;
  return (
    <section>
      <h2 {...tip('tip.stress')}>{t('stressAndTrauma')}</h2>
      <div className="row" data-testid="stress">
        <Boxes n={max} value={doc.stress} red onChange={setStress} label={t('stress')} />
      </div>
      <div className="small" data-testid="stress-msg">{full && <span className="warn">{t('stress.full')}</span>}</div>
      <Traumas />
      <h2 style={{ marginTop: 14 }} {...tip('tip.harm')}>{t('harm')}</h2>
      <div className="harm l3">
        <b>3</b>
        <input aria-label={t('harm.level', { n: 3 })} value={doc.harm.l3} onChange={(e) => setHarm('l3', 0, e.target.value)} />
        <span className="small">{t('harm.l3')}</span>
      </div>
      {(['l2', 'l1'] as const).map((r) => (
        <div key={r} className="harm">
          <b>{r === 'l2' ? 2 : 1}</b>
          {[0, 1].map((i) => (
            <input key={i} aria-label={`${t('harm.level', { n: r === 'l2' ? 2 : 1 })} ${i + 1}`} value={doc.harm[r][i]} onChange={(e) => setHarm(r, i, e.target.value)} />
          ))}
          <span className="small">{t(r === 'l2' ? 'harm.l2' : 'harm.l1')}</span>
        </div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <Clock value={doc.healing} onChange={setHealing} label={t('healing')} />
        <div><b>{t('healing')}</b><div className="small">{t('healing.hint')}</div></div>
      </div>
    </section>
  );
}

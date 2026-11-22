// Character creation wizard (pp. 66-72): steps with Back/Next, a tip per step, a live summary on the side.
import { useState } from 'react';
import { contentText, getLang, t, type Key } from '../i18n';
import type { Origin } from '../model';
import { commonContent, actionDefs, bookName, playbookList, playbooks, talentDefs } from '../store/content';
import { createCharacter, openCharacter } from '../store/session';
import { useUi } from '../store/ui';
import { BookLink, Dots } from '../ui/widgets';
import {
  activeLimits, applyBuild, attributesOf, buildCharacter, canAddTalent, dotsUsed, setDot, setLimits, setMode, setPlaybook,
  talentCost, talentsUsed, type Draft, type Mode, type WizContact, newDraft,
} from './logic';
import { closeWizard, startStep, useWizard } from './state';
import './wizard.css';

const STEPS = ['playbook', 'heritage', 'background', 'actions', 'talents', 'contacts', 'vice', 'identity'] as const;
type Step = (typeof STEPS)[number];
const PAGE: Record<Step, number> = { playbook: 66, heritage: 67, background: 68, actions: 69, talents: 69, contacts: 70, vice: 70, identity: 71 };
const CUSTOM = '__custom';
type OriginKey = 'heritage' | 'background' | 'vice';
const ATTRS = ['insight', 'prowess', 'resolve'] as const;

const short = (id: string) => contentText(getLang(), id)?.short ?? '';
const contactLabel = (c: WizContact) => (c.name !== undefined ? c.name : c.bookId ? [bookName(c.bookId), short(c.bookId)].filter(Boolean).join(', ') : '');
const originLabel = (o: Origin) => (o.bookId ? bookName(o.bookId) : o.name || '');

export function Wizard() {
  const open = useWizard((s) => s.open);
  return open ? <WizardBody /> : null;
}

function WizardBody() {
  const [d, setD] = useState<Draft>(() => newDraft('leech'));
  const [step, setStep] = useState(startStep);
  const [error, setError] = useState('');
  const s = STEPS[step];
  const upd = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  async function finish() {
    try {
      await openCharacter(buildCharacter(d));
      useUi.getState().set({ tab: 'sheet' });
      closeWizard();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }
  async function skip() {
    await createCharacter(d.playbookId);
    useUi.getState().set({ tab: 'sheet' });
    closeWizard();
  }

  return (
    <div className="wiz" role="dialog" aria-label={t('wiz.title')} data-testid="wizard">
      <header>
        <h1>{t('wiz.title')}</h1>
        <nav className="tabs">
          {STEPS.map((x, i) => (
            <button key={x} className={i === step ? 'on' : ''} onClick={() => setStep(i)}>{i + 1}. {t(`wiz.step.${x}` as Key)}</button>
          ))}
        </nav>
        <button onClick={skip} data-testid="wiz-skip">{t('wiz.skip')}</button>
        <button onClick={closeWizard} aria-label={t('wiz.cancel')} title={t('wiz.cancel')}>✕</button>
      </header>
      <div className="wizbody">
        <section className="wizstep" data-step={s}>
          <h2>{step + 1}. {t(`wiz.step.${s}` as Key)}</h2>
          <p className="tip">{t(`wiz.tip.${s}` as Key)}<BookLink page={PAGE[s]} /></p>
          {s === 'playbook' && <PlaybookStep d={d} setD={setD} />}
          {(s === 'heritage' || s === 'background' || s === 'vice') && <OriginStep k={s} d={d} upd={upd} />}
          {s === 'actions' && <ActionsStep d={d} setD={setD} />}
          {s === 'talents' && <TalentsStep d={d} setD={setD} />}
          {s === 'contacts' && <ContactsStep d={d} upd={upd} />}
          {s === 'identity' && <IdentityStep d={d} upd={upd} />}
          {error && <p className="warn" data-testid="wiz-error">{error}</p>}
          <div className="row wiznav">
            <button disabled={step === 0} onClick={() => setStep(step - 1)} data-testid="wiz-back">{t('wiz.back')}</button>
            {step < STEPS.length - 1
              ? <button className="primary" onClick={() => setStep(step + 1)} data-testid="wiz-next">{t('wiz.next')}</button>
              : <button className="primary" onClick={finish} data-testid="wiz-finish">{t('wiz.finish')}</button>}
          </div>
        </section>
        <Summary d={d} />
      </div>
    </div>
  );
}

function PlaybookStep({ d, setD }: { d: Draft; setD: (f: (x: Draft) => Draft) => void }) {
  const pb = playbooks[d.playbookId];
  const l = d.limits;
  const num = (label: Key, k: 'dots' | 'maxRating' | 'talents', min: number, max: number) => (
    <label className="lim">{t(label)}
      <input type="number" min={min} max={max} value={l[k]} data-testid={`lim-${k}`}
        onChange={(e) => setD((x) => setLimits(x, { [k]: Math.max(min, Math.min(max, +e.target.value || min)) }))} />
    </label>
  );
  return (
    <>
      <div className="row modes">
        {(['book', 'running'] as Mode[]).map((m) => (
          <label key={m} className={`chk${d.mode === m ? ' on' : ''}`}>
            <input type="radio" name="wiz-mode" checked={d.mode === m} onChange={() => setD((x) => setMode(x, m))} data-testid={`mode-${m}`} />
            {t(`wiz.mode.${m}` as Key)}
          </label>
        ))}
      </div>
      <p className="small">{t(`wiz.mode.${d.mode}.hint` as Key)}</p>
      {d.mode === 'running' && (
        <div className="row limits" data-testid="limits">
          {num('wiz.limit.dots', 'dots', 0, 48)}
          {num('wiz.limit.max', 'maxRating', 1, 4)}
          {num('wiz.limit.talents', 'talents', 1, 12)}
          <label className="lim">{t('wiz.limit.foreign')}
            <select value={l.foreignCost} data-testid="lim-foreign" onChange={(e) => setD((x) => setLimits(x, { foreignCost: +e.target.value as 1 | 2 }))}>
              <option value={1}>x1</option><option value={2}>x2</option>
            </select>
          </label>
        </div>
      )}
      <div className="cards">
        {playbookList.map((p) => (
          <button key={p.id} className={`card${p.id === d.playbookId ? ' on' : ''}`} data-playbook={p.id} onClick={() => setD((x) => (x.playbookId === p.id ? x : setPlaybook(x, p.id)))}>
            <b>{bookName(p.id)}</b>
            <span className="small">{short(p.id)}</span>
            <span className="small">{contentText(getLang(), p.id)?.text}</span>
          </button>
        ))}
      </div>
      {pb.builds.length > 0 && (
        <>
          <h3>{t('wiz.build')}</h3>
          <div className="cards">
            <button className={`card${!d.buildId ? ' on' : ''}`} data-build="" onClick={() => setD((x) => applyBuild(x, undefined))}>{t('wiz.build.none')}</button>
            {pb.builds.map((b) => (
              <button key={b.id} className={`card${d.buildId === b.id ? ' on' : ''}`} data-build={b.id} onClick={() => setD((x) => applyBuild(x, b.id))}>
                <b>{bookName(b.id)}</b>
                <span className="small">{contentText(getLang(), b.id)?.text}</span>
                <span className="small">{t('wiz.talent')}: {bookName(b.talent)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function OriginStep({ k, d, upd }: { k: OriginKey; d: Draft; upd: (p: Partial<Draft>) => void }) {
  const o = d[k];
  const ids = (k === 'heritage' ? commonContent.heritages : k === 'background' ? commonContent.backgrounds : commonContent.vices).map((x) => x.id);
  const isCustom = o.name !== undefined && !o.bookId;
  return (
    <>
      <div className="cards" data-testid={`origin-${k}`}>
        {ids.map((id) => (
          <button key={id} className={`card${o.bookId === id ? ' on' : ''}`} data-id={id} onClick={() => upd({ [k]: { bookId: id, note: o.note } })}>
            <b>{bookName(id)}</b><span className="small">{short(id)}</span>
            {/* the full text is long; the book page link in the tip has it */}
          </button>
        ))}
        <button className={`card${isCustom ? ' on' : ''}`} data-id={CUSTOM} onClick={() => upd({ [k]: { name: o.name ?? '', note: o.note } })}><b>{t('bio.custom')}</b></button>
      </div>
      {isCustom && <input aria-label={t('bio.customPh')} data-testid={`${k}-name`} value={o.name} placeholder={t('bio.customPh')} onChange={(e) => upd({ [k]: { ...o, name: e.target.value } })} />}
      <input aria-label={t(`bio.${k}Note` as Key)} data-testid={`${k}-note`} value={o.note} placeholder={t(`bio.${k}Note` as Key)} onChange={(e) => upd({ [k]: { ...o, note: e.target.value } })} />
    </>
  );
}

function ActionsStep({ d, setD }: { d: Draft; setD: (f: (x: Draft) => Draft) => void }) {
  const l = activeLimits(d), pb = playbooks[d.playbookId];
  const left = l.dots - dotsUsed(d);
  return (
    <>
      <p data-testid="dots-left" className={left < 0 ? 'warn' : ''}>{t('wiz.dotsLeft', { n: left, total: l.dots, max: l.maxRating })}</p>
      <div className="attrs3">
        {ATTRS.map((at) => (
          <div key={at}>
            <h3>{t(`attr.${at}`)} <b data-testid={`wattr-${at}`}>{attributesOf(d)[at]}</b></h3>
            {actionDefs.filter((a) => a.attribute === at).map((a) => (
              <div className="row act" key={a.id} data-action={a.id}>
                <span className="an">{bookName(a.id)}{pb.startingActions[a.id] ? <i className="small" title={t('wiz.startDots')}> ({pb.startingActions[a.id]})</i> : null}</span>
                <Dots value={d.actions[a.id]} max={l.maxRating} label={bookName(a.id)} onChange={(v) => setD((x) => setDot(x, a.id, v))} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function TalentsStep({ d, setD }: { d: Draft; setD: (f: (x: Draft) => Draft) => void }) {
  const pb = playbooks[d.playbookId], l = activeLimits(d);
  const [cn, setCn] = useState(''), [ct, setCt] = useState('');
  const toggle = (id: string) => setD((x) => (x.talents.includes(id) ? { ...x, talents: x.talents.filter((y) => y !== id) } : canAddTalent(x, id) ? { ...x, talents: [...x.talents, id] } : x));
  const foreign = Object.values(talentDefs).filter((x) => x.owner !== d.playbookId && x.group === 'ability' && !d.talents.includes(x.id));
  const row = (id: string) => (
    <label key={id} className={`talent chk${d.talents.includes(id) ? ' on' : ''}`} data-talent={id}>
      <input type="checkbox" checked={d.talents.includes(id)} disabled={!d.talents.includes(id) && !canAddTalent(d, id)} onChange={() => toggle(id)} />
      <span><b>{bookName(id)}</b> <span className="small">{talentCost(d, id) > 1 ? `x${talentCost(d, id)}` : ''}</span><br /><span className="small">{contentText(getLang(), id)?.text}</span></span>
    </label>
  );
  return (
    <>
      <p data-testid="talents-left">{t('wiz.talentsLeft', { used: talentsUsed(d), total: l.talents })}</p>
      {pb.talents.map((x) => row(x.id))}
      {d.talents.filter((id) => talentDefs[id]?.owner !== d.playbookId).map(row)}
      {d.mode === 'running' && (
        <>
          <select aria-label={t("wiz.foreignAdd", { n: l.foreignCost })} data-testid="add-foreign" value="" onChange={(e) => e.target.value && toggle(e.target.value)}>
            <option value="">{t('wiz.foreignAdd', { n: l.foreignCost })}</option>
            {playbookList.filter((p) => p.id !== d.playbookId).map((p) => (
              <optgroup key={p.id} label={bookName(p.id)}>
                {foreign.filter((x) => x.owner === p.id).map((x) => <option key={x.id} value={x.id} disabled={!canAddTalent(d, x.id)}>{bookName(x.id)}</option>)}
              </optgroup>
            ))}
          </select>
        </>
      )}
      <h3>{t('wiz.customTalent')}</h3>
      {d.customTalents.map((c, i) => (
        <div className="row" key={i}><b>{c.name}</b><span className="small">{c.text}</span>
          <button aria-label={t('remove')} onClick={() => setD((x) => ({ ...x, customTalents: x.customTalents.filter((_, j) => j !== i) }))}>✕</button></div>
      ))}
      <div className="row">
        <input value={cn} placeholder={t('wiz.customName')} aria-label={t('wiz.customName')} data-testid="ct-name" onChange={(e) => setCn(e.target.value)} />
        <input value={ct} placeholder={t('wiz.customText')} aria-label={t('wiz.customText')} onChange={(e) => setCt(e.target.value)} />
        <button disabled={!cn.trim() || talentsUsed(d) + 1 > l.talents} data-testid="ct-add"
          onClick={() => { setD((x) => ({ ...x, customTalents: [...x.customTalents, { name: cn.trim(), text: ct }] })); setCn(''); setCt(''); }}>{t('wiz.add')}</button>
      </div>
    </>
  );
}

function ContactPick({ who, d, upd }: { who: 'friend' | 'rival'; d: Draft; upd: (p: Partial<Draft>) => void }) {
  const c = d[who];
  const ids = playbooks[d.playbookId].friends;
  const value = !c ? '' : c.bookId && c.name === undefined ? c.bookId : CUSTOM;
  return (
    <div className={`contactpick ${who}`}>
      <h3>{who === 'friend' ? '▲ ' : '▼ '}{t(who === 'friend' ? 'bio.friend' : 'bio.rival')}</h3>
      <select aria-label={t(who === 'friend' ? 'bio.friend' : 'bio.rival')} data-testid={`pick-${who}`} value={value}
        onChange={(e) => { const v = e.target.value; upd({ [who]: v === '' ? null : v === CUSTOM ? { name: '', note: c?.note ?? '' } : { bookId: v, note: c?.note ?? '' } }); }}>
        <option value="">{t('wiz.contactNone')}</option>
        <optgroup label={t('bio.fromBook')}>{ids.map((id) => <option key={id} value={id}>{contactLabel({ bookId: id, note: '' })}</option>)}</optgroup>
        <option value={CUSTOM}>{t('bio.custom')}</option>
      </select>
      {c && c.name !== undefined && !c.bookId && <input aria-label={t('bio.contactName')} data-testid={`${who}-name`} value={c.name} placeholder={t('bio.contactName')} onChange={(e) => upd({ [who]: { ...c, name: e.target.value } })} />}
      {c && <input aria-label={t('bio.contactNote')} value={c.note} placeholder={t('bio.contactNote')} onChange={(e) => upd({ [who]: { ...c, note: e.target.value } })} />}
    </div>
  );
}
const ContactsStep = ({ d, upd }: { d: Draft; upd: (p: Partial<Draft>) => void }) => (
  <div className="grid2"><ContactPick who="friend" d={d} upd={upd} /><ContactPick who="rival" d={d} upd={upd} /></div>
);

function IdentityStep({ d, upd }: { d: Draft; upd: (p: Partial<Draft>) => void }) {
  return (
    <>
      <div className="row">
        <input aria-label={t('name')} data-testid="wiz-name" value={d.name} placeholder={t('name')} onChange={(e) => upd({ name: e.target.value })} />
        <input aria-label={t('alias')} data-testid="wiz-alias" value={d.alias} placeholder={t('alias')} onChange={(e) => upd({ alias: e.target.value })} />
      </div>
      <label>{t('bio.look')}</label>
      <textarea className="grow" value={d.look} placeholder={t('bio.lookPh')} onChange={(e) => upd({ look: e.target.value })} />
    </>
  );
}

function Summary({ d }: { d: Draft }) {
  const l = activeLimits(d), at = attributesOf(d);
  const row = (k: Key, v: string) => <div className="srow"><span className="small">{t(k)}</span><b>{v || '—'}</b></div>;
  const talents = [...d.talents.map(bookName), ...d.customTalents.map((c) => c.name)].filter(Boolean).join(', ');
  return (
    <aside className="wizsum" data-testid="wiz-summary">
      <h3>{t('wiz.summary')}</h3>
      {row('wiz.step.playbook', bookName(d.playbookId))}
      {row('wiz.mode', t(`wiz.mode.${d.mode}` as Key))}
      {row('bio.heritage', originLabel(d.heritage))}
      {row('bio.background', originLabel(d.background))}
      {row('wiz.step.actions', `${dotsUsed(d)} / ${l.dots} · ${t('attr.insight')} ${at.insight} · ${t('attr.prowess')} ${at.prowess} · ${t('attr.resolve')} ${at.resolve}`)}
      {row('wiz.step.talents', `${talentsUsed(d)} / ${l.talents}${talents ? ': ' + talents : ''}`)}
      {row('bio.friend', d.friend ? contactLabel(d.friend) : '')}
      {row('bio.rival', d.rival ? contactLabel(d.rival) : '')}
      {row('bio.vice', originLabel(d.vice))}
      {row('name', [d.name, d.alias && `«${d.alias}»`].filter(Boolean).join(' '))}
    </aside>
  );
}

import { useState } from 'react';
import { loadLimit, loadUsed } from '../../engine/load';
import { toMajor, toMinor, totalMinor } from '../../engine/money';
import { talentMods } from '../../engine/talents';
import { t } from '../../i18n';
import { bookName, commonContent, playbooks, talentDefs } from '../../store/content';
import {
  addBookItem, addCustomItem, breakOne, joinOne, removeItem, setCarried, setCoins, setItemName, setLoad, setLoadLevel, setMajor,
  setMinor, setQty, setStash, toggleBase, toggleOpen,
} from '../../store/gearActions';
import { gearToProject, moveItem } from '../../store/workshopActions';
import { useRules, useStore } from '../../store/store';
import { Boxes, BookLink, tip } from '../widgets';
import { Contents, ItemDialog, PropLine, hasContents, type Item } from './ItemParts';

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function Money() {
  const doc = useStore((s) => s.doc)!;
  const { money: rm } = useRules();
  const m = doc.money;
  const [calc, setCalc] = useState<{ major: string; minor: string }>({ major: '', minor: '' });
  const rate = rm.rate;
  if (rm.book) {
    const rank = m.stash <= 10 ? 'poor' : m.stash <= 20 ? 'modest' : m.stash < 40 ? 'middle' : 'rich';
    return (
      <div id="moneyBook" data-testid="money-book">
        <div className="row"><span className="small lbl">{t('coin')}</span><span className="row"><Boxes n={4} value={m.coins} onChange={setCoins} label={t('coin')} /></span></div>
        <div className="row" style={{ marginTop: 6, alignItems: 'flex-start' }}>
          <span className="small lbl">{t('stash')}</span>
          <span className="row" style={{ flex: 1, gap: 3 }}><Boxes n={40} value={m.stash} onChange={setStash} label={t('stash')} /></span>
        </div>
        <div className="small" data-testid="stash-info">{t('money.stashInfo', { level: Math.floor(m.stash / 10), rank: t(`money.rank.${rank}`) })}</div>
      </div>
    );
  }
  const total = totalMinor(m, rate);
  return (
    <div className="money" data-testid="money-custom">
      <label>{rm.major}<input type="number" min={0} aria-label={rm.major} value={m.major} onChange={(e) => setMajor(+e.target.value)} /></label>
      <label>{rm.minor}<input type="number" min={0} aria-label={rm.minor} value={m.minor} onChange={(e) => setMinor(+e.target.value)} /></label>
      <button onClick={() => breakOne(rate)} disabled={m.major < 1} title={`1 ${rm.major} → ${rate} ${rm.minor}`}>{t('money.break')}</button>
      <button onClick={() => joinOne(rate)} disabled={m.minor < rate} title={`${rate} ${rm.minor} → 1 ${rm.major}`}>{t('money.join')}</button>
      <span className="small" data-testid="money-total">{t('money.total', { minor: total, major: fmt(toMajor(total, rate)), mn: rm.minor, mj: rm.major })}</span>
      <span className="calc">🧮{' '}
        <input type="number" aria-label={`${t('money.calc')} ${rm.major}`} value={calc.major}
          onChange={(e) => setCalc({ major: e.target.value, minor: e.target.value === '' ? '' : fmt(toMinor(+e.target.value, rate)) })} /> {rm.major} ={' '}
        <input type="number" aria-label={`${t('money.calc')} ${rm.minor}`} value={calc.minor}
          onChange={(e) => setCalc({ minor: e.target.value, major: e.target.value === '' ? '' : fmt(toMajor(+e.target.value, rate)) })} /> {rm.minor}
      </span>
    </div>
  );
}

function ItemRow({ i, onNote }: { i: Item; onNote: () => void }) {
  const rules = useRules();
  const bn = i.bookId ? bookName(i.bookId) : '';
  const several = i.qty > 1;
  const canMove = !i.slots?.length;
  return (
    <>
      <div className={`inv${rules.load ? '' : ' noload'}${i.carried ? '' : ' off'}${hasContents(i) ? ' grp' : ''}`} data-item={i.id}>
        <button className={`fold${hasContents(i) ? '' : ' empty'}`} onClick={() => toggleOpen(i.id)} title={t('item.fold')} aria-label={t('item.fold')} aria-expanded={i.open}>{i.open ? '▾' : '▸'}</button>
        <input data-f="name" value={i.name ?? bn} placeholder={bn || t('item.name')} title={bn ? t('item.byBook', { name: bn }) : undefined} onChange={(e) => setItemName(i.id, e.target.value, bn)} />
        <input data-f="qty" type="number" min={1} max={99} value={i.qty} title={t('item.qtyTotal')} onChange={(e) => setQty(i.id, +e.target.value)} />
        {several
          ? <input data-f="carried" type="number" min={0} max={i.qty} className="take" value={i.carried} title={t('item.carriedHint')} onChange={(e) => setCarried(i.id, +e.target.value)} />
          : <button data-f="base" className={i.carried ? 'on' : ''} onClick={() => toggleBase(i.id)} title={t('item.toggleBase')}>{t(i.carried ? 'item.withMe' : 'item.atBase')}</button>}
        {rules.load && <input data-f="load" type="number" min={0} max={9} value={i.load} title={t('item.loadEach')} onChange={(e) => setLoad(i.id, +e.target.value)} />}
        <button className={`note${i.note ? ' has' : ''}`} onClick={onNote} title={t('item.noteProps')} aria-label={t('item.noteProps')}>✎</button>
        <button onClick={() => removeItem(i.id)} title={t('remove')} aria-label={t('remove')}>✕</button>
      </div>
      <PropLine x={i} />
      {i.open && (
        <div className={`sub${i.carried ? '' : ' off'}`}>
          {i.bookId && i.name && i.name !== bn && <div className="small">{t('item.byBook', { name: bn })}</div>}
          <Contents x={i} />
          {canMove && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="subadd" onClick={() => moveItem(i.id, 'workshop')}>{t('gear.toWorkshopEquip')}</button>
              {!i.bookId && <button className="subadd" onClick={() => gearToProject(i.id)}>{t('gear.toProject')}</button>}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function Gear() {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  const [note, setNote] = useState<string | null>(null);
  const items = doc.items.filter((i) => i.place === 'gear');
  const have = new Set(doc.items.map((i) => i.bookId));
  const mods = talentMods(doc, talentDefs);
  const used = loadUsed(doc.items);
  const lim = loadLimit(doc.load, rules, mods);
  const free = (list: { id: string; load: number }[]) => list.filter((d) => !have.has(d.id));
  const special = free(playbooks[doc.playbookId]?.items ?? []);
  const common = free(commonContent.items);
  const opt = (d: { id: string; load: number }) => <option key={d.id} value={d.id}>{bookName(d.id)} [{d.load}]</option>;
  return (
    <main id="gear">
      <section>
        <h2>{t('tab.gear')}</h2>
        <h3 {...tip('tip.money')}>
          {t('money')}<BookLink page={54} />
          {!rules.money.book && <span className="small">1 = {rules.money.rate}</span>}
        </h3>
        <Money />
        <h3 className="row" style={{ justifyContent: 'space-between', margin: '14px 0 8px' }}>
          {t('items')}
          {lim !== null && (
            <span className="row" style={{ fontWeight: 'normal', fontSize: 14 }}>
              <select aria-label={t('load')} value={doc.load} onChange={(e) => setLoadLevel(e.target.value as typeof doc.load)} {...tip('tip.load')}>
                {(['light', 'normal', 'heavy'] as const).map((l) => <option key={l} value={l}>{t(`load.${l}`)} {loadLimit(l, rules, mods)}</option>)}
              </select>
              <span data-testid="load-used">{t('load.used')} <b className={used > lim ? 'warn' : ''}>{used}</b> / {lim}</span>
            </span>
          )}
        </h3>
        <div data-testid="inv">
          {items.length > 0 && (
            <div className={`inv head${rules.load ? '' : ' noload'}`}>
              <span /><span>{t('item.col.name')}</span><span>{t('item.col.total')}</span><span>{t('item.col.carried')}</span>{rules.load && <span>{t('item.col.load')}</span>}<span /><span />
            </div>
          )}
          {items.map((i) => <ItemRow key={i.id} i={i} onNote={() => setNote(i.id)} />)}
          {!items.length && <div className="small" style={{ margin: '6px 0' }}>{t('gear.empty')}</div>}
        </div>
        <select aria-label={t('gear.add')} value="" style={{ width: '100%', marginTop: 6 }}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') addCustomItem();
            else if (v) addBookItem(v);
          }}>
          <option value="">{t('gear.add')}</option>
          <option value="custom">{t('gear.addCustom')}</option>
          {special.length > 0 && <optgroup label={t('gear.group.special')}>{special.map(opt)}</optgroup>}
          <optgroup label={t('gear.group.common')}>{common.map(opt)}</optgroup>
        </select>
      </section>
      {note && <ItemDialog id={note} onClose={() => setNote(null)} />}
    </main>
  );
}

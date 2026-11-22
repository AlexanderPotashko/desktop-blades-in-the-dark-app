// Pieces shared by Gear and Workshop: properties line, contents/bandolier, the ✎ dialog.
import { useEffect, useState } from 'react';
import './gear.css';
import { ItemType, type Character, type ItemProps } from '../../model';
import { contentText, getLang, t } from '../../i18n';
import { bookArmor, commonContent } from '../../store/content';
import {
  addSub, bookContents, findThing, removeSub, setNote, setProps, setSlot, setSub, toggleFlaw, useOnce, type Thing,
} from '../../store/gearActions';
import { itemName } from '../../store/actions';
import { useRules, useStore } from '../../store/store';

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
export type Item = Character['items'][number];

const flawName = (f: string) => contentText(getLang(), f)?.name ?? f;
export const thingName = (x: Thing): string => ('place' in x ? itemName(x) : x.name);
const left = (p: ItemProps) => p.usesLeft ?? p.uses;

/** One-line summary of the properties that are set (under the row). */
export function PropLine({ x }: { x: Thing }) {
  const p = x.props;
  const bits: React.ReactNode[] = [];
  if (p.type) bits.push(t(`itemType.${p.type}`));
  if (p.quality !== undefined) bits.push(`${t('item.quality').toLowerCase()} ${ROMAN[p.quality]}`);
  if (p.fine) bits.push(t('item.fine').toLowerCase());
  if (p.uses !== undefined || p.usesLeft !== undefined) {
    bits.push(
      <span key="u">
        {t('item.usesShort')} {left(p) ?? 0}{p.uses !== undefined ? ` / ${p.uses}` : ''}{' '}
        <button className="mini" onClick={() => useOnce(x.id)} title={t('item.useOne')}>−1</button>
      </span>,
    );
  }
  if (p.flaws.length) bits.push(p.flaws.map(flawName).join(', '));
  if (p.gives) bits.push(`${t('item.gives').toLowerCase()}: ${p.gives}`);
  if (!bits.length) return null;
  return <div className="propline small">{bits.flatMap((b, i) => (i ? [' · ', b] : [b]))}</div>;
}

/** Does the row have contents (so the fold button is not dimmed)? */
export const hasContents = (x: Thing) => ('slots' in x && !!x.slots?.length) || (x.sub ?? bookContents(x)).length > 0;

function Stock({ itemId, name }: { itemId?: string; name: string }) {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  if (!name) return null;
  if (rules.bandolier === 'book') return <span className="small">{t('band.bookHint')}</span>;
  const stock = (itemId && doc.items.find((i) => i.id === itemId)) || doc.items.find((i) => thingName(i).trim() === name.trim());
  return <span className="small">{stock ? t('band.stock', { n: stock.qty }) : t('band.noStock')}</span>;
}

/** Contents of an item: bandolier slots, or a list of sub-items (book list until the first edit). */
export function Contents({ x }: { x: Thing }) {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  if ('slots' in x && x.slots?.length) {
    const own = rules.bandolier === 'own-items';
    const options = own
      ? [...new Set(doc.items.filter((i) => i.id !== x.id).map((i) => thingName(i).trim()).filter(Boolean))]
      : bookContents(x);
    const listId = `slots-${x.id}`;
    return (
      <>
        <div className="small" data-tip={t(own ? 'tip.bandOwn' : 'tip.bandBook')}>{t('band.title', { n: x.slots.length })}</div>
        <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
        {x.slots.map((s, j) => (
          <div key={j}>
            <div className="subrow band" data-slot={j}>
              <input type="number" min={0} value={s.qty ?? ''} title={t('item.subQty')} aria-label={t('item.subQty')} onChange={(e) => setSlot(x.id, j, { qty: e.target.value === '' ? undefined : +e.target.value })} />
              <input list={listId} value={s.name} placeholder={t('band.empty')} aria-label={`${t('band.slot')} ${j + 1}`}
                onChange={(e) => {
                  const name = e.target.value;
                  const stock = own ? doc.items.find((i) => i.id !== x.id && thingName(i).trim() === name.trim()) : undefined;
                  setSlot(x.id, j, { name, itemId: stock?.id });
                }} />
            </div>
            <Stock itemId={s.itemId} name={s.name} />
          </div>
        ))}
      </>
    );
  }
  const rows = x.sub
    ? x.sub.map((s) => ({ key: s.id, name: s.name, qty: s.qty }))
    : bookContents(x).map((name, i) => ({ key: `#${i}`, name, qty: undefined as number | undefined }));
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className="subrow" data-sub={r.key}>
          <input type="number" min={0} value={r.qty ?? ''} title={t('item.subQtyHint')} aria-label={t('item.subQty')} onChange={(e) => setSub(x.id, r.key, { qty: e.target.value === '' ? undefined : +e.target.value })} />
          <input value={r.name} placeholder={t('item.subName')} onChange={(e) => setSub(x.id, r.key, { name: e.target.value })} />
          <button onClick={() => removeSub(x.id, r.key)} title={t('remove')} aria-label={t('remove')}>✕</button>
        </div>
      ))}
      <button className="subadd" onClick={() => addSub(x.id)}>{t('item.subAdd')}</button>
    </>
  );
}

/** ✎ dialog: note and (behind ⚙) properties. Same for gear items, workshop equipment and projects. */
export function ItemDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const x = useStore((s) => findThing(s.doc!, id));
  const rules = useRules();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!x) return null;
  const p = x.props;
  const armor = p.armor ?? ('bookId' in x && x.bookId ? bookArmor[x.bookId] ?? 0 : 0);
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.floor(+v) || 0));
  const customFlaws = p.flaws.filter((f) => !commonContent.flaws.some((b) => b.id === f));
  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={thingName(x) || t('item.unnamed')} data-testid="item-dialog">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <h3 style={{ margin: 0 }}>{thingName(x) || t('item.unnamed')}</h3>
          <button className={open ? 'on' : ''} onClick={() => setOpen(!open)} title={t('item.props')} aria-label={t('item.props')} aria-expanded={open}>{open ? '−' : '⚙'}</button>
        </div>
        {open && (
          <div className="props" data-testid="item-props">
            <label>{t('item.type')}
              <select value={p.type ?? ''} onChange={(e) => setProps(id, { type: e.target.value ? ItemType.parse(e.target.value) : undefined })}>
                <option value="">{t('itemType.none')}</option>
                {ItemType.options.filter((o) => o !== 'standard').map((o) => <option key={o} value={o}>{t(`itemType.${o}`)}</option>)}
              </select>
            </label>
            <label>{t('item.quality')}
              <select value={p.quality ?? ''} onChange={(e) => setProps(id, { quality: num(e.target.value) })}>
                <option value="">{t('item.qualityTier', { r: ROMAN[rules.crewTier] })}</option>
                {[0, 1, 2, 3, 4, 5, 6].map((q) => <option key={q} value={q}>{ROMAN[q]}</option>)}
              </select>
            </label>
            <label className="chk"><input type="checkbox" checked={p.fine} onChange={(e) => setProps(id, { fine: e.target.checked })} /> {t('item.fineLong')}</label>
            <label>{t('item.uses')}
              <span className="row" style={{ flexWrap: 'nowrap' }}>
                <input type="number" min={0} aria-label={t('item.usesLeft')} value={p.usesLeft ?? p.uses ?? ''} onChange={(e) => setProps(id, { usesLeft: num(e.target.value) })} />
                <span>/</span>
                <input type="number" min={0} aria-label={t('item.usesTotal')} value={p.uses ?? ''} placeholder="∞" onChange={(e) => setProps(id, { uses: num(e.target.value) })} />
              </span>
            </label>
            <label>{t('item.armor')}
              <input type="number" min={0} max={5} title={t('item.armorHint')} value={armor} onChange={(e) => setProps(id, { armor: num(e.target.value) ?? 0 })} />
            </label>
            <label className="wide">{t('item.gives')}
              <input value={p.gives} placeholder={t('item.givesHint')} onChange={(e) => setProps(id, { gives: e.target.value })} />
            </label>
            <div className="wide">
              <span className="small">{t('item.flaws')}</span>
              <div className="row">
                {commonContent.flaws.map((f) => (
                  <label key={f.id} className="chk" title={contentText(getLang(), f.id)?.short}>
                    <input type="checkbox" checked={p.flaws.includes(f.id)} onChange={() => toggleFlaw(id, f.id)} /> {flawName(f.id).toLowerCase()}
                  </label>
                ))}
                {customFlaws.map((f) => (
                  <label key={f} className="chk"><input type="checkbox" checked onChange={() => toggleFlaw(id, f)} /> {f}</label>
                ))}
                <input value={draft} placeholder={t('item.flawCustom')} style={{ width: 150 }} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { toggleFlaw(id, draft.trim()); setDraft(''); } }} />
              </div>
            </div>
          </div>
        )}
        <textarea data-testid="item-note" value={x.note} placeholder={t('item.notePlaceholder')} autoFocus onChange={(e) => setNote(id, e.target.value)} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose}>{t('item.done')}</button>
        </div>
      </div>
    </div>
  );
}

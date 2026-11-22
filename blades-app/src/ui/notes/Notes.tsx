// Notes and Rules tabs: one component, the cards are filtered by kind. List (search, pinned first, drag to reorder) + editor.
import { useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { matchesCard, parseNote, rollsInText, visibleCards, type Block, type CardKind, type RollLabels } from '../../engine/cards';
import { t } from '../../i18n';
import type { Card } from '../../model';
import { addCard, addCardImage, addPlan, deleteCard, moveCard, removeCardImage, setCard, togglePin } from '../../store/notesActions';
import { useStore } from '../../store/store';
import { PlanEditor } from './Plan';
import { imageFiles, shrinkImage } from './images';
import './notes.css';

const labels = (): RollLabels => ({ sum: t('roll.sum'), best: t('roll.best'), crit: t('roll.crit'), success: t('roll.success'), partial: t('roll.partial'), fail: t('roll.fail') });
const firstLine = (x: string) => x.split('\n').find((l) => l.trim()) ?? '';
const hasPlan = (c: Card) => !!c.plan?.floors.some((f) => f.shapes.length);

function Inline({ s }: { s: string }) {
  return <>{s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}
function NoteBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'gap': return <div key={i} className="ngap" />;
          case 'hr': return <hr key={i} />;
          case 'h3': return <h3 key={i}><Inline s={b.s} /></h3>;
          case 'h4': return <h4 key={i}><Inline s={b.s} /></h4>;
          case 'li': return <div key={i} className="nli">• <Inline s={b.s} /></div>;
          case 'p': return <div key={i}><Inline s={b.s} /></div>;
          case 'msg': return <div key={i} className="nchip nmsg">💬 <b>{b.who}:</b> {b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inline s={l} /></span>)}</div>;
          case 'roll': return <div key={i} className="nchip nroll">🎲 <b>{b.who}</b> <span className="dim">· {b.die}</span> {b.dice} <span className={b.cls}>{b.verdict}</span></div>;
        }
      })}
    </>
  );
}

function Item({ card, on, disabled, onSelect }: { card: Card; on: boolean; disabled: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled });
  return (
    <button
      ref={setNodeRef} {...attributes} {...listeners} data-card={card.id} type="button"
      className={`ci${on ? ' on' : ''}${card.pinned ? ' pin' : ''}${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }} title={t('notes.dragHint')} onClick={onSelect}
    >
      <b className="ct">{card.title || t('notes.untitled')}</b>
      {(hasPlan(card) || card.images.length > 0) && (
        <span className="cpi">{hasPlan(card) && t('notes.badgePlan')}{hasPlan(card) && card.images.length > 0 && ' · '}{card.images.length > 0 && `🖼 ${card.images.length}`}</span>
      )}
      <span className="cp">{firstLine(card.text) || t('notes.blank')}</span>
    </button>
  );
}

export function Notes({ kind }: { kind: CardKind }) {
  const cards = useStore((s) => s.doc!.cards);
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState<string | undefined>();
  const [mode, setMode] = useState<'text' | 'plan'>('text');
  const [editing, setEditing] = useState(false); // false: rendered view (when there is text)
  const [msg, setMsg] = useState('');
  const [big, setBig] = useState<{ cardId: string; imageId: string } | null>(null);
  const [focusRoom, setFocusRoom] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const all = visibleCards(cards, kind);
  const list = all.filter((c) => matchesCard(c, query));
  const cur = all.find((c) => c.id === selId) ?? list[0];
  const planMode = mode === 'plan' && !!cur?.plan;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const select = (id: string) => { setSelId(id); setEditing(false); setMsg(''); };

  const onDragEnd = (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) moveCard(kind, String(e.active.id), String(e.over.id)); };

  const add = () => {
    const id = addCard(kind);
    setSelId(id); setMode('text'); setEditing(true); setQuery('');
  };
  const remove = () => {
    if (cur && ((!cur.title && !cur.text.trim() && !cur.images.length && !cur.plan) || window.confirm(t('notes.deleteConfirm', { title: cur.title || t('notes.untitled') })))) deleteCard(cur.id);
  };
  const formatRolls = () => {
    if (!cur) return;
    const nt = rollsInText(cur.text, labels());
    if (nt === cur.text) setMsg(t('notes.rollsNone'));
    else { setMsg(''); setCard(cur.id, { text: nt }); }
  };

  const addImages = async (files: File[]) => {
    if (!cur) return;
    for (const f of files) {
      try { const r = await shrinkImage(f); addCardImage(cur.id, { src: r.src }); } catch { setMsg(t('notes.imageBad')); }
    }
  };
  // Ctrl+V of an image while the text side is open (the plan handles its own paste)
  useEffect(() => {
    if (planMode) return;
    const on = (e: ClipboardEvent) => {
      const fs = imageFiles([...(e.clipboardData?.items ?? [])].flatMap((i) => (i.kind === 'file' ? [i.getAsFile()!] : [])));
      if (fs.length) { e.preventDefault(); void addImages(fs); }
    };
    document.addEventListener('paste', on);
    return () => document.removeEventListener('paste', on);
  });
  // "to the text" from a plan room: select its [[ heading ]] line
  useEffect(() => {
    if (focusRoom === null || !ta.current || !cur) return;
    const lines = cur.text.split('\n'), i = lines.findIndex((l) => l.replace(/\s/g, '').toLowerCase() === `[[${focusRoom.replace(/\s/g, '')}]]`.toLowerCase());
    ta.current.focus();
    if (i >= 0) {
      const at = lines.slice(0, i).join('\n').length + (i ? 1 : 0);
      ta.current.setSelectionRange(at, at + lines[i].length);
      ta.current.scrollTop = Math.max(0, i * parseFloat(getComputedStyle(ta.current).lineHeight || '22') - 40);
    }
    setFocusRoom(null);
  }, [focusRoom, cur, editing, mode]);

  const showView = !editing && !!cur?.text.trim();
  const bigImg = big && cards.find((c) => c.id === big.cardId)?.images.find((i) => i.id === big.imageId);

  return (
    <main id="notes">
      <section className="notes">
        <aside>
          <button onClick={add} data-testid="add-card">{t(kind === 'rule' ? 'rules.add' : 'notes.add')}</button>
          <input type="search" aria-label={t('notes.search')} placeholder={t('notes.search')} value={query} data-testid="card-search" onChange={(e) => setQuery(e.target.value)} />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={list.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div id="cardList">
                {list.map((c) => <Item key={c.id} card={c} on={c.id === cur?.id} disabled={!!query.trim()} onSelect={() => select(c.id)} />)}
              </div>
            </SortableContext>
          </DndContext>
          {!list.length && query.trim() && all.length > 0 && <div className="small">{t('notes.noMatch')}</div>}
        </aside>
        <div id="cardEd">
          {!cur ? (
            <div className="small" style={{ margin: 'auto' }}>{t(kind === 'rule' ? 'rules.empty' : 'notes.empty')}</div>
          ) : (
            <div key={cur.id} className="ed" onDragOver={(e) => !planMode && [...e.dataTransfer.types].includes('Files') && e.preventDefault()}
              onDrop={(e) => { const fs = imageFiles([...e.dataTransfer.files]); if (!planMode && fs.length) { e.preventDefault(); void addImages(fs); } }}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="edt" data-testid="card-title" value={cur.title} placeholder={t('notes.titlePh')} onChange={(e) => setCard(cur.id, { title: e.target.value })} />
                <button className={cur.pinned ? 'on' : ''} data-testid="card-pin" title={t(cur.pinned ? 'notes.unpinTip' : 'notes.pinTip')} onClick={() => togglePin(cur.id)}>📌 {t(cur.pinned ? 'notes.pinned' : 'notes.pin')}</button>
                <button onClick={remove}>{t('notes.delete')}</button>
              </div>
              <div className="ntabs">
                <button className={planMode ? '' : 'on'} onClick={() => setMode('text')}>{t('notes.tabText')}</button>
                <button className={planMode ? 'on' : ''} title={cur.plan ? undefined : t('notes.tabAddPlanTip')} onClick={() => { addPlan(cur.id); setMode('plan'); }}>{t(cur.plan ? 'notes.tabPlan' : 'notes.tabAddPlan')}</button>
                <span style={{ flex: 1 }} />
                {!planMode && cur.text.trim() && (
                  <button title={t(showView ? 'notes.editTip' : 'notes.viewTip')} onClick={() => { setEditing(showView); if (showView) setTimeout(() => ta.current?.focus()); }}>{t(showView ? 'notes.edit' : 'notes.view')}</button>
                )}
                {!planMode && !showView && <button title={t('notes.rollsTip')} onClick={formatRolls}>{t('notes.rolls')}</button>}
                {!planMode && (
                  <>
                    <button title={t('notes.imageTip')} onClick={() => fileInput.current?.click()}>{t('notes.image')}</button>
                    <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages(imageFiles([...(e.target.files ?? [])])); e.target.value = ''; }} />
                  </>
                )}
              </div>
              {planMode ? (
                <PlanEditor card={cur} onGoText={(room) => { setMode('text'); setEditing(true); setFocusRoom(room); }} />
              ) : (
                <>
                  {showView ? (
                    <div className="edx nview" data-testid="card-view" title={t('notes.viewDbl')} onDoubleClick={() => { setEditing(true); setTimeout(() => ta.current?.focus()); }}>
                      <NoteBlocks blocks={parseNote(cur.text, labels())} />
                    </div>
                  ) : (
                    <textarea ref={ta} className="edx" data-testid="card-text" value={cur.text} placeholder={t('notes.textPh')} onFocus={() => setEditing(true)} onChange={(e) => setCard(cur.id, { text: e.target.value })} />
                  )}
                  {msg && <div className="small">{msg}</div>}
                  {cur.images.length > 0 && (
                    <div className="gal">
                      {cur.images.map((i) => <img key={i.id} src={i.src} alt="" title={t('notes.imageOpen')} onClick={() => setBig({ cardId: cur.id, imageId: i.id })} />)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>
      {bigImg && (
        <div className="imgbig" role="dialog" onClick={() => setBig(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <img src={bigImg.src} alt="" />
            <div className="row" style={{ justifyContent: 'center' }}>
              <button onClick={() => { if (window.confirm(t('notes.imageDelete') + '?')) { removeCardImage(big!.cardId, big!.imageId); setBig(null); } }}>{t('notes.imageDelete')}</button>
              <button onClick={() => setBig(null)}>{t('notes.close')}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

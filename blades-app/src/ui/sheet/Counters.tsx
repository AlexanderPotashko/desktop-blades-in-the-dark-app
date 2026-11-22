import { useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { armorAvailable, specialArmor } from '../../engine/armor';
import type { RestKind, RestResult } from '../../engine/rest';
import { CounterReset, type Counter } from '../../model';
import { t } from '../../i18n';
import { bookArmor, talentDefs } from '../../store/content';
import {
  addCounter, applyDowntime, applyRest, bumpCounter, itemName, moveCounter, presets, removeCounter, setArmorUsed, setCounter,
  setCounterValue, talentName, toggleSpecialArmor,
} from '../../store/actions';
import { useRules, useStore } from '../../store/store';
import { tip } from '../widgets';

export function Rest() {
  const rules = useRules();
  const [res, setRes] = useState<{ kind: RestKind; r: RestResult } | null>(null);
  const go = (kind: RestKind) => {
    const r = applyRest(kind);
    if (r) setRes({ kind, r });
  };
  const what = res && [
    res.r.counters.length && t('rest.counters', { n: res.r.counters.length }),
    res.r.specialArmor.length && t('rest.specialArmor'),
    res.r.armor && t('rest.armor'),
  ].filter(Boolean).join(', ');
  const options = !rules.downtime.book ? rules.downtime.options : [];
  return (
    <>
      <div className="rest">
        {rules.dayCounter && <button onClick={() => go('day')} {...tip('tip.restDay')}>{t('rest.day')}</button>}
        <button onClick={() => go('downtime')} {...tip('tip.restDowntime')}>{t('downtime')}</button>
        <button onClick={() => go('score')} {...tip('tip.restScore')}>{t('newScore')}</button>
      </div>
      {options.length > 0 && (
        <div className="rest" aria-label={t('rest.options')}>
          {options.map((o) => (
            <button key={o.id} onClick={() => applyDowntime(o)} title={t('rest.optionHint', { h: o.healing, s: o.stressRelief })}>{o.name}</button>
          ))}
        </div>
      )}
      <div className="small" data-testid="rest-msg">{res && (what ? t('rest.done', { what }) : t('rest.nothing'))}</div>
    </>
  );
}

export function Protection() {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  const rows = armorAvailable(doc, bookArmor);
  const special = specialArmor(doc, talentDefs, rules);
  const item = (id: string) => doc.items.find((i) => i.id === id)!;
  return (
    <>
      <h3 {...tip('tip.protection')}>{t('armor')}</h3>
      <div data-testid="protection">
        {rows.map((r) => (
          <div key={r.itemId} className="spec" data-armor={r.itemId}>
            {Array.from({ length: r.boxes }, (_, j) => (
              <span key={j} role="checkbox" aria-checked={j < r.used} aria-label={`${itemName(item(r.itemId))} ${j + 1}`} tabIndex={0}
                className={`box${j < r.used ? ' on' : ''}`} onClick={() => setArmorUsed(r.itemId, j + 1 === r.used ? j : j + 1)} />
            ))}
            <b>{itemName(item(r.itemId))}</b>
            <span className="small">{t('armor.untilScore')}</span>
          </div>
        ))}
        {special.map((s) => (
          <div key={s.talents.join()} className="spec" data-special={s.shared ? 'shared' : s.talents[0]}>
            <span role="checkbox" aria-checked={s.used} aria-label={t('armor.special')} tabIndex={0} className={`box${s.used ? ' on' : ''}`}
              onClick={() => toggleSpecialArmor(s.shared ? null : s.talents[0])} />
            <b>{s.shared ? t('armor.special') : talentName(doc, s.talents[0])}{!s.shared && <span className="small"> ({t('armor.special').toLowerCase()})</span>}</b>
            <span className="small">{s.shared ? `${s.talents.map((x) => talentName(doc, x)).join(', ')} · ` : ''}{t('armor.untilDowntime')}</span>
          </div>
        ))}
        {!rows.length && !special.length && <div className="small">{t('armor.none')}</div>}
      </div>
    </>
  );
}

function CounterCard({ c }: { c: Counter }) {
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const asBoxes = c.max !== undefined && c.max > 0 && c.max <= 12;
  return (
    <div ref={setNodeRef} className={`dz${isDragging ? ' dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }} data-counter={c.id}>
      <span className="grip" {...attributes} {...listeners} title={t('counters.drag')} aria-label={t('counters.drag')}>⠿</span>
      <div className="ctr">
        <div className="chd">
          <b className="cn" title={c.name}>{c.name || <i>{t('counters.unnamed')}</i>}</b>
          <span className="crs" title={t('counters.resetsWhen')}>↺ {t(`reset.${c.reset}`)}</span>
          <button className={`cgear${editing ? ' on' : ''}`} onClick={() => setEditing(!editing)} title={t('counters.configure')} aria-label={t('counters.configure')}>⚙</button>
        </div>
        {c.hint && <div className="small">{c.hint}</div>}
        <div className="cbody">
          <button onClick={() => bumpCounter(c.id, -1)} title="−1" aria-label="−1">−</button>
          {asBoxes ? (
            <span className="cboxes">
              {Array.from({ length: c.max! }, (_, j) => (
                <span key={j} role="checkbox" aria-checked={j < c.value} tabIndex={0} aria-label={`${c.name} ${j + 1}`}
                  className={`box${j < c.value ? ' on' : ''}`} onClick={() => setCounterValue(c.id, j + 1 === c.value ? j : j + 1)} />
              ))}
            </span>
          ) : (
            <span className="cv" data-testid="counter-value">{c.value}{c.max !== undefined && <small> / {c.max}</small>}</span>
          )}
          <button onClick={() => bumpCounter(c.id, 1)} title="+1" aria-label="+1">+</button>
        </div>
        {editing && (
          <div className="cset">
            <label>{t('counters.name')}<input value={c.name} onChange={(e) => setCounter(c.id, { name: e.target.value })} /></label>
            <label>{t('counters.max')}
              <input type="number" min={0} value={c.max ?? ''} placeholder="∞" title={t('counters.maxHint')}
                onChange={(e) => setCounter(c.id, { max: e.target.value === '' ? undefined : Math.max(0, Math.floor(+e.target.value)) })} />
            </label>
            <label>{t('counters.reset')}
              <select value={c.reset} onChange={(e) => setCounter(c.id, { reset: CounterReset.parse(e.target.value) })}>
                {CounterReset.options.map((r) => <option key={r} value={r}>{t(`reset.${r}`)}</option>)}
              </select>
            </label>
            <button className="cdel" onClick={() => removeCounter(c.id)}>{t('remove')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Counters() {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const avail = presets(doc, rules).filter((p) => !doc.counters.some((c) => c.fromTalent === p.talent));
  const onEnd = (e: DragEndEvent) => e.over && moveCounter(String(e.active.id), String(e.over.id));
  return (
    <>
      <div data-testid="counters">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
          <SortableContext items={doc.counters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {doc.counters.map((c) => <CounterCard key={c.id} c={c} />)}
          </SortableContext>
        </DndContext>
        {!doc.counters.length && <div className="small">{t('counters.none')}</div>}
      </div>
      <select aria-label={t('counters.add')} value="" style={{ width: '100%' }}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'blank') addCounter();
          else if (v) addCounter(avail.find((p) => p.talent === v));
        }}>
        <option value="">{t('counters.add')}</option>
        <option value="blank">{t('counters.blank')}</option>
        {avail.map((p) => <option key={p.talent} value={p.talent}>{t('counters.byTalent', { name: talentName(doc, p.talent) })}</option>)}
      </select>
    </>
  );
}

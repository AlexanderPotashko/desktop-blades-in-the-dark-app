import { useState } from 'react';
import { t } from '../../i18n';
import type { WorkItem } from '../../model';
import { bookName } from '../../store/content';
import { addCustomItem, removeItem, setItemName, setLoad, setQty, toggleOpen } from '../../store/gearActions';
import { addProject, gearToProject, moveItem, projectToGear, removeProject, setProject } from '../../store/workshopActions';
import { useRules, useStore } from '../../store/store';
import { Boxes, BookLink, tip } from '../widgets';
import { Contents, ItemDialog, PropLine, hasContents, thingName, type Item } from '../gear/ItemParts';

type Project = WorkItem;

function EquipRow({ i, onNote }: { i: Item; onNote: () => void }) {
  const bn = i.bookId ? bookName(i.bookId) : '';
  return (
    <>
      <div className={`inv wsrow${hasContents(i) ? ' grp' : ''}`} data-equip={i.id}>
        <button className={`fold${hasContents(i) ? '' : ' empty'}`} onClick={() => toggleOpen(i.id)} title={t('item.fold')} aria-label={t('item.fold')} aria-expanded={i.open}>{i.open ? '▾' : '▸'}</button>
        <input value={i.name ?? bn} placeholder={bn || t('ws.equipPlaceholder')} title={bn ? t('item.byBook', { name: bn }) : undefined} onChange={(e) => setItemName(i.id, e.target.value, bn)} />
        <input type="number" min={1} max={99} value={i.qty} title={t('item.qtyHow')} onChange={(e) => setQty(i.id, +e.target.value)} />
        <button className={`note${i.note ? ' has' : ''}`} onClick={onNote} title={t('item.noteProps')} aria-label={t('item.noteProps')}>✎</button>
        <button data-act="to-gear" onClick={() => moveItem(i.id, 'gear')} title={t('ws.equipToGear')} aria-label={t('ws.equipToGear')}>→</button>
        <button onClick={() => removeItem(i.id)} title={t('remove')} aria-label={t('remove')}>✕</button>
      </div>
      <PropLine x={i} />
      {i.open && <div className="sub"><Contents x={i} /></div>}
    </>
  );
}

function ProjectRow({ w, onNote }: { w: Project; onNote: () => void }) {
  const done = w.total !== undefined && w.total > 0 && (w.done ?? 0) >= w.total;
  const n = (v: string) => (v === '' ? undefined : +v);
  return (
    <>
      <div className={`inv prodrow${hasContents(w) ? ' grp' : ''}${done ? ' done' : ''}`} data-project={w.id}>
        <button className={`fold${hasContents(w) ? '' : ' empty'}`} onClick={() => toggleOpen(w.id)} title={t('item.fold')} aria-label={t('item.fold')} aria-expanded={w.open}>{w.open ? '▾' : '▸'}</button>
        <input data-f="name" value={w.name} placeholder={t('ws.projectPlaceholder')} onChange={(e) => setProject(w.id, { name: e.target.value })} />
        <span className="prog">
          <input data-f="done" type="number" min={0} value={w.done ?? ''} title={t('ws.done')} aria-label={t('ws.done')} onChange={(e) => setProject(w.id, { done: n(e.target.value) })} />
          <span>/</span>
          <input data-f="total" type="number" min={0} value={w.total ?? ''} title={t('ws.total')} aria-label={t('ws.total')} onChange={(e) => setProject(w.id, { total: n(e.target.value) })} />
        </span>
        <input data-f="qty" type="number" min={0} value={w.qty} title={t('ws.qty')} aria-label={t('ws.qty')} onChange={(e) => setProject(w.id, { qty: +e.target.value })} />
        <button className={`note${w.note ? ' has' : ''}`} onClick={onNote} title={t('item.noteProps')} aria-label={t('item.noteProps')}>✎</button>
        <button data-act="to-gear" onClick={() => projectToGear(w.id)} title={t('ws.projectToGear')} aria-label={t('ws.projectToGear')}>→</button>
        <button onClick={() => removeProject(w.id)} title={t('remove')} aria-label={t('remove')}>✕</button>
      </div>
      {w.total !== undefined && w.total > 0 && w.total <= 12 && (
        <div className="row prog-boxes"><Boxes n={w.total} value={Math.min(w.done ?? 0, w.total)} onChange={(v) => setProject(w.id, { done: v })} label={thingName(w) || t('ws.progress')} /></div>
      )}
      <PropLine x={w} />
      {w.open && <div className="sub"><WorkLoad w={w} /><Contents x={w} /></div>}
    </>
  );
}

/** Load per piece of a project (used once it is moved to gear). */
function WorkLoad({ w }: { w: Project }) {
  const rules = useRules();
  if (!rules.load) return null;
  return (
    <label className="row" style={{ margin: '0 0 6px', color: 'var(--ink)' }}>
      {t('item.loadEach')}
      <input type="number" min={0} max={9} style={{ width: 56 }} value={w.load} onChange={(e) => setLoad(w.id, +e.target.value)} />
    </label>
  );
}

export function Workshop() {
  const doc = useStore((s) => s.doc)!;
  const [note, setNote] = useState<string | null>(null);
  const equip = doc.items.filter((i) => i.place === 'workshop');
  const ownGear = doc.items.filter((i) => i.place === 'gear' && !i.bookId);
  const movable = doc.items.filter((i) => i.place === 'gear' && !i.slots?.length);
  return (
    <main id="workshop" className="wide1">
      <section>
        <h2 {...tip('tip.wsEquip')}>{t('ws.equipment')}</h2>
        <div data-testid="equipment">
          {equip.length > 0 && <div className="inv wsrow head"><span /><span>{t('ws.col.equip')}</span><span>{t('ws.col.qty')}</span><span /><span /><span /></div>}
          {equip.map((i) => <EquipRow key={i.id} i={i} onNote={() => setNote(i.id)} />)}
          {!equip.length && <div className="small" style={{ margin: '6px 0' }}>{t('ws.equipEmpty')}</div>}
        </div>
        <select aria-label={t('ws.equipAdd')} value="" style={{ width: '100%', marginTop: 6 }}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'new') addCustomItem('workshop');
            else if (v) moveItem(v, 'workshop');
          }}>
          <option value="">{t('ws.equipAdd')}</option>
          <option value="new">{t('ws.equipNew')}</option>
          {movable.length > 0 && <optgroup label={t('ws.fromGear')}>{movable.map((i) => <option key={i.id} value={i.id}>{thingName(i) || t('item.unnamed')}</option>)}</optgroup>}
        </select>
      </section>
      <section>
        <h2 {...tip('tip.wsProjects')}>{t('ws.projects')}<BookLink page={270} /></h2>
        <div data-testid="projects">
          {doc.workshop.length > 0 && <div className="inv prodrow head"><span /><span>{t('ws.col.project')}</span><span>{t('ws.col.progress')}</span><span>{t('ws.col.qty')}</span><span /><span /><span /></div>}
          {doc.workshop.map((w) => <ProjectRow key={w.id} w={w} onNote={() => setNote(w.id)} />)}
          {!doc.workshop.length && <div className="small" style={{ margin: '6px 0' }}>{t('ws.projectsEmpty')}</div>}
        </div>
        <select aria-label={t('ws.projectAdd')} value="" style={{ width: '100%', marginTop: 6 }}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'new') addProject();
            else if (v) gearToProject(v);
          }}>
          <option value="">{t('ws.projectAdd')}</option>
          <option value="new">{t('ws.projectNew')}</option>
          {ownGear.length > 0 && <optgroup label={t('ws.fromGear')}>{ownGear.map((i) => <option key={i.id} value={i.id}>{thingName(i) || t('item.unnamed')}</option>)}</optgroup>}
        </select>
      </section>
      {note && <ItemDialog id={note} onClose={() => setNote(null)} />}
    </main>
  );
}

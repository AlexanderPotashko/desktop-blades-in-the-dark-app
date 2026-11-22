// Floor-plan editor of a card: SVG on a grid, floors, rooms/walls/doors/windows/pencil/labels/markers, images.
// A shape being drawn, moved or resized lives in component state and is written to the document once, on pointer-up
// (one undo step). Pan and zoom are not stored: the view is fitted to the floor when it is opened.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { fitView, GRID, movedShape, roomText, shapeBox, snap } from '../../engine/cards';
import { t, type Key } from '../../i18n';
import type { Card, Shape } from '../../model';
import { addFloor, addShape, planFromText, removeFloor, removePlan, removeShape, renameFloor, replaceShape, setFloor } from '../../store/notesActions';
import { imageFiles, shrinkImage } from './images';

type Tool = 'sel' | 'room' | 'wall' | 'door' | 'window' | 'pen' | 'text' | 'mark';
const TOOLS: Array<[Tool, string]> = [['sel', '↖'], ['room', '▭'], ['wall', '━'], ['door', '┅'], ['window', '═'], ['pen', '✎'], ['text', 'T'], ['mark', '●']];
const GLYPHS = ['✕', '!', '?', '●', '★', '☠', '⚑', '⚠', '👤', '🛡', '⚔', '👁', '🔔', '🚪', '🔒', '🔑', '🪜', '⬆', '⬇', '🕳', '🔥', '💧', '🕯', '🩸', '💊', '⚗', '🔧', '💰', '📦', '📜', '✚'];
const uuid = () => crypto.randomUUID();
const ink = { stroke: 'var(--ink)' }, acc = { stroke: 'var(--acc)' }, red = { stroke: 'var(--red)' };

type Drag =
  | { k: 'pan'; cx: number; cy: number; vx: number; vy: number }
  | { k: 'move'; x: number; y: number; o: Shape }
  | { k: 'size'; o: Extract<Shape, { kind: 'room' | 'image' }> }
  | { k: 'new'; x0: number; y0: number };

function ShapeSvg({ s }: { s: Shape }) {
  switch (s.kind) {
    case 'image': return <image href={s.src} x={s.x} y={s.y} width={s.w} height={s.h} preserveAspectRatio="none" />;
    case 'room':
      return (
        <>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} style={{ ...ink, fill: 'var(--acc)', fillOpacity: 0.08, strokeWidth: 2 }} />
          {s.label && <text x={s.x + s.w / 2} y={s.y + s.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={14} style={{ fill: 'var(--ink)' }}>{s.label}</text>}
        </>
      );
    case 'wall': case 'door': case 'window': {
      const a = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }, L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
      const hit = <line {...a} stroke="transparent" strokeWidth={14} />;
      if (s.kind === 'wall') return <>{hit}<line {...a} style={{ ...ink, strokeWidth: 5, strokeLinecap: 'round' }} /></>;
      if (s.kind === 'window') {
        const nx = (-(s.y2 - s.y1) / L) * 6, ny = ((s.x2 - s.x1) / L) * 6;
        const pts = [[s.x1 + nx, s.y1 + ny], [s.x2 + nx, s.y2 + ny], [s.x2 - nx, s.y2 - ny], [s.x1 - nx, s.y1 - ny]].map((q) => q.join(',')).join(' ');
        return <>{hit}<polygon points={pts} style={{ ...ink, fill: 'var(--panel)', strokeWidth: 2.5 }} /><line {...a} style={{ ...acc, strokeWidth: 3 }} /></>;
      }
      const ex = s.x1 - (s.y2 - s.y1), ey = s.y1 + (s.x2 - s.x1); // door leaf hinged at (x1,y1), swings to the drawing side
      return (
        <>
          {hit}
          <line {...a} style={{ stroke: 'var(--panel)', strokeWidth: 8 }} />
          <line x1={s.x1} y1={s.y1} x2={ex} y2={ey} style={{ ...ink, strokeWidth: 3, strokeLinecap: 'round' }} />
          <path d={`M${s.x2} ${s.y2}A${L} ${L} 0 0 1 ${ex} ${ey}`} style={{ ...acc, fill: 'none', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
        </>
      );
    }
    case 'pen': {
      const pts = s.points.map((q) => q.join(',')).join(' ');
      return <><polyline points={pts} fill="none" stroke="transparent" strokeWidth={12} /><polyline points={pts} style={{ ...red, fill: 'none', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }} /></>;
    }
    case 'text': return <text x={s.x} y={s.y} fontSize={15} style={{ fill: 'var(--ink)' }}>{s.text}</text>;
    case 'mark':
      return (
        <>
          <circle cx={s.x} cy={s.y} r={12} style={{ fill: 'var(--panel)', ...red, strokeWidth: 2 }} />
          <text x={s.x} y={s.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight="bold" style={{ fill: 'var(--red)' }}>{s.glyph}</text>
          {s.label && <text x={s.x} y={s.y + 28} textAnchor="middle" fontSize={12} style={{ fill: 'var(--ink)' }}>{s.label}</text>}
        </>
      );
  }
}

export function PlanEditor({ card, onGoText }: { card: Card; onGoText: (roomName: string) => void }) {
  const plan = card.plan!;
  const floor = plan.floors[Math.min(plan.current, plan.floors.length - 1)];
  const [tool, setTool] = useState<Tool>('sel');
  const [glyph, setGlyph] = useState('✕');
  const [sel, setSel] = useState<string | null>(null);
  const [live, setLive] = useState<Shape | null>(null);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [note, setNote] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const size = () => ({ W: svg.current?.clientWidth || 800, H: svg.current?.clientHeight || 500 });

  // fit the view when another card or floor is shown
  useEffect(() => {
    const { W, H } = size();
    setView(fitView(floor, W, H));
    setSel(null);
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, floor.id]);

  const shapes = floor.shapes.map((s) => (live && live.id === s.id ? live : s));
  if (live && !floor.shapes.some((s) => s.id === live.id)) shapes.push(live);
  const selected = shapes.find((s) => s.id === sel);

  const zoomBy = (k: number, mx = size().W / 2, my = size().H / 2) =>
    setView((v) => {
      const zoom = Math.min(5, Math.max(0.15, v.zoom * k));
      return { zoom, x: mx - ((mx - v.x) * zoom) / v.zoom, y: my - ((my - v.y) * zoom) / v.zoom };
    });
  // wheel must be non-passive to stop the page from scrolling
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  const toPlan = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [(e.clientX - r.left - view.x) / view.zoom, (e.clientY - r.top - view.y) / view.zoom];
  };

  const down = (e: RPointerEvent<SVGSVGElement>) => {
    svg.current?.focus();
    const pan = () => (drag.current = { k: 'pan', cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y });
    try { svg.current?.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    if (e.button !== 0) return void (e.button <= 2 && pan());
    const [x, y] = toPlan(e);
    const target = e.target as Element;
    const handle = target.closest('[data-h]'), hit = target.closest('[data-id]');
    if (tool === 'sel' || (handle && tool !== 'pen')) {
      if (handle && (selected?.kind === 'room' || selected?.kind === 'image')) { drag.current = { k: 'size', o: selected }; return; }
      if (hit) {
        const s = shapes.find((q) => q.id === hit.getAttribute('data-id'))!;
        setSel(s.id);
        drag.current = { k: 'move', x, y, o: s };
        return;
      }
      setSel(null);
      pan();
      return;
    }
    if (tool === 'text' || tool === 'mark') {
      const s: Shape = tool === 'text' ? { id: uuid(), kind: 'text', x: snap(x, 5), y: snap(y, 5), text: t('plan.textDefault') } : { id: uuid(), kind: 'mark', x: snap(x, 5), y: snap(y, 5), glyph, label: '' };
      addShape(card.id, s);
      setSel(s.id);
      return;
    }
    const [sx, sy] = [snap(x), snap(y)];
    const s: Shape =
      tool === 'room' ? { id: uuid(), kind: 'room', x: sx, y: sy, w: 0, h: 0, label: '' }
      : tool === 'pen' ? { id: uuid(), kind: 'pen', points: [[Math.round(x), Math.round(y)], [Math.round(x), Math.round(y)]] }
      : { id: uuid(), kind: tool as 'wall' | 'door' | 'window', x1: sx, y1: sy, x2: sx, y2: sy };
    drag.current = { k: 'new', x0: sx, y0: sy };
    setLive(s);
  };

  const moveTo = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = toPlan(e);
    if (d.k === 'pan') setView({ ...view, x: d.vx + e.clientX - d.cx, y: d.vy + e.clientY - d.cy });
    else if (d.k === 'move') setLive(movedShape(d.o, snap(x - d.x, d.o.kind === 'room' || 'x1' in d.o ? GRID : 5), snap(y - d.y, d.o.kind === 'room' || 'x1' in d.o ? GRID : 5)));
    else if (d.k === 'size') {
      const o = d.o, w = Math.max(GRID, o.kind === 'image' ? Math.round(x - o.x) : snap(x) - o.x);
      setLive({ ...o, w, h: o.kind === 'image' ? Math.round((w * o.h) / o.w) : Math.max(GRID, snap(y) - o.y) });
    } else if (live) {
      const X = snap(x), Y = snap(y);
      if (live.kind === 'room') setLive({ ...live, x: Math.min(d.x0, X), y: Math.min(d.y0, Y), w: Math.abs(X - d.x0), h: Math.abs(Y - d.y0) });
      else if (live.kind === 'pen') {
        const q = live.points.at(-1)!;
        if (Math.hypot(x - q[0], y - q[1]) > 2) setLive({ ...live, points: [...live.points, [Math.round(x), Math.round(y)]] });
      } else if ('x1' in live) {
        let [nx, ny] = [X, Y];
        if (e.shiftKey) Math.abs(nx - live.x1) > Math.abs(ny - live.y1) ? (ny = live.y1) : (nx = live.x1);
        setLive({ ...live, x2: nx, y2: ny });
      }
    }
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.k === 'pan') return;
    const s = live;
    setLive(null);
    if (!s) return;
    if (d.k === 'new') {
      const tiny = s.kind === 'room' ? s.w < GRID || s.h < GRID : s.kind === 'pen' ? s.points.length < 3 : 'x1' in s && s.x1 === s.x2 && s.y1 === s.y2;
      if (tiny) return;
      addShape(card.id, s);
      setSel(s.id);
    } else if (JSON.stringify(s) !== JSON.stringify(d.o)) replaceShape(card.id, s);
  };

  const keys = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeShape(card.id, sel); setSel(null); }
    else if (e.key === 'Escape') { setSel(null); setTool('sel'); }
  };

  const addImages = async (files: File[]) => {
    for (const f of files) {
      try {
        const r = await shrinkImage(f), { W, H } = size();
        const k = Math.min(1, (W * 0.6) / view.zoom / r.w, (H * 0.6) / view.zoom / r.h), w = Math.round(r.w * k), h = Math.round(r.h * k);
        const s: Shape = { id: uuid(), kind: 'image', src: r.src, w, h, x: Math.round((W / 2 - view.x) / view.zoom - w / 2), y: Math.round((H / 2 - view.y) / view.zoom - h / 2) };
        addShape(card.id, s);
        setSel(s.id);
        setTool('sel');
      } catch { setNote(t('notes.imageBad')); }
    }
  };
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      const fs = imageFiles([...(e.clipboardData?.items ?? [])].flatMap((i) => (i.kind === 'file' ? [i.getAsFile()!] : [])));
      if (fs.length) { e.preventDefault(); void addImages(fs); }
    };
    document.addEventListener('paste', on);
    return () => document.removeEventListener('paste', on);
  });

  const fromText = () => {
    const n = planFromText(card.id);
    setNote(n < 0 ? t('plan.fromTextNone') : n ? t('plan.fromTextAdded', { n }) : t('plan.fromTextSame'));
  };

  const label = selected && (selected.kind === 'room' ? selected.label : selected.kind === 'text' ? selected.text : selected.kind === 'mark' ? selected.label : null);
  const setLabel = (v: string) => {
    if (selected?.kind === 'room' || selected?.kind === 'mark') replaceShape(card.id, { ...selected, label: v }, `lbl:${selected.id}`);
    else if (selected?.kind === 'text') replaceShape(card.id, { ...selected, text: v }, `lbl:${selected.id}`);
  };
  const desc = selected?.kind === 'room' && selected.label ? roomText(card.text, selected.label) : undefined;
  const box = selected && shapeBox(selected), q = 6 / view.zoom;

  return (
    <div className="plan" onDragOver={(e) => [...e.dataTransfer.types].includes('Files') && e.preventDefault()}
      onDrop={(e) => { const fs = imageFiles([...e.dataTransfer.files]); if (fs.length) { e.preventDefault(); void addImages(fs); } }}>
      <div className="ptool">
        <span className="pfl">
          {plan.floors.map((f, i) => (
            <button key={f.id} className={f === floor ? 'on' : ''} onClick={() => setFloor(card.id, i)}>{f.name || '…'}</button>
          ))}
          <button onClick={() => addFloor(card.id)} title={t('plan.addFloor')} aria-label={t('plan.addFloor')}>+</button>
        </span>
        <i className="sep" />
        {TOOLS.map(([k, ic]) => (
          <button key={k} className={tool === k ? 'on' : ''} data-tool={k} title={t(`plan.tool.${k}` as Key)} aria-label={t(`plan.tool.${k}` as Key)} aria-pressed={tool === k}
            onClick={() => { setTool(k); if (k !== 'sel') setSel(null); }}>{k === 'mark' ? glyph : ic}</button>
        ))}
        <select aria-label={t('plan.glyph')} title={t('plan.glyph')} value={glyph} style={{ width: 'auto' }} onChange={(e) => { setGlyph(e.target.value); setTool('mark'); }}>
          {GLYPHS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <i className="sep" />
        <button data-del onClick={() => { if (sel) { removeShape(card.id, sel); setSel(null); } }} disabled={!sel} title={t('plan.delete')} aria-label={t('plan.delete')}>🗑</button>
        <button onClick={() => zoomBy(1.25)} title={t('plan.zoomIn')} aria-label={t('plan.zoomIn')}>+</button>
        <button onClick={() => zoomBy(0.8)} title={t('plan.zoomOut')} aria-label={t('plan.zoomOut')}>−</button>
        <button onClick={() => { const { W, H } = size(); setView(fitView(floor, W, H)); }} title={t('plan.fit')} aria-label={t('plan.fit')}>⤢</button>
        <i className="sep" />
        <button onClick={fromText} title={t('plan.fromTextTip')}>{t('plan.fromText')}</button>
        <label className="imgbtn" title={t('notes.imageTip')}>
          {t('notes.image')}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { void addImages(imageFiles([...(e.target.files ?? [])])); e.target.value = ''; }} />
        </label>
        <button onClick={() => { if (!plan.floors.some((f) => f.shapes.length) || window.confirm(t('plan.killConfirm'))) removePlan(card.id); }} title={t('plan.killTip')}>{t('plan.kill')}</button>
      </div>
      <div className="row" style={{ margin: '4px 0' }}>
        <input aria-label={t('plan.floorName')} value={floor.name} style={{ width: 180 }} onChange={(e) => renameFloor(card.id, e.target.value)} />
        {plan.floors.length > 1 && (
          <button onClick={() => { if (!floor.shapes.length || window.confirm(t('plan.delFloorConfirm', { name: floor.name }))) removeFloor(card.id); }}>{t('plan.delFloor')}</button>
        )}
      </div>
      <div className="pwrap">
        <svg ref={svg} className={tool === 'sel' ? 'sel' : ''} tabIndex={0} data-testid="plan-svg" onContextMenu={(e) => e.preventDefault()}
          onPointerDown={down} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} onKeyDown={keys}>
          <defs>
            <pattern id="pg" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={`M${GRID} 0H0V${GRID}`} fill="none" style={{ stroke: 'var(--line)', strokeWidth: 0.7 }} /></pattern>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#pg)" />
            {shapes.map((s) => <g key={s.id} data-id={s.id}><ShapeSvg s={s} /></g>)}
            {selected && box && (
              <>
                <rect x={box.x - q} y={box.y - q} width={box.w + 2 * q} height={box.h + 2 * q} fill="none" style={{ ...acc, strokeWidth: 1.5 / view.zoom, strokeDasharray: `${5 / view.zoom} ${4 / view.zoom}` }} pointerEvents="none" />
                {(selected.kind === 'room' || selected.kind === 'image') && (
                  <rect data-h x={selected.x + selected.w - 6 / view.zoom} y={selected.y + selected.h - 6 / view.zoom} width={12 / view.zoom} height={12 / view.zoom} style={{ fill: 'var(--acc)', cursor: 'nwse-resize' }} />
                )}
              </>
            )}
          </g>
        </svg>
      </div>
      <div className="small pinfo">
        {label !== null && label !== undefined ? (
          <>
            <label className="inl">
              {t(selected!.kind === 'room' ? 'plan.labelRoom' : selected!.kind === 'text' ? 'plan.labelText' : 'plan.labelMark')}{' '}
              <input data-testid="plan-label" autoFocus={selected!.kind !== 'mark'} value={label} placeholder={selected!.kind === 'mark' ? t('plan.markPh') : ''} style={{ width: 260 }} onChange={(e) => setLabel(e.target.value)} />
            </label>
            {selected!.kind === 'room' && selected!.label && (
              <>
                {' · '}{desc === null ? t('plan.inText', { name: selected!.label }) : desc || t('plan.noDesc')}
                <button onClick={() => onGoText((selected as { label: string }).label)}>{t('plan.goText')}</button>
              </>
            )}
          </>
        ) : note || t('plan.help')}
      </div>
    </div>
  );
}

// Pure logic of note/rule cards: display order, drag-and-drop reorder, search, chat dice rolls, plan geometry.
import { arrayMove } from '@dnd-kit/sortable';
import type { Card, Floor, Shape } from '../model';

export type CardKind = Card['kind'];

/** Cards of a kind as shown: pinned first, otherwise the array order (newest first; drag-and-drop edits it). */
export const visibleCards = (cards: readonly Card[], kind: CardKind): Card[] => {
  const mine = cards.filter((c) => c.kind === kind);
  return [...mine.filter((c) => c.pinned), ...mine.filter((c) => !c.pinned)];
};

/** Drag `activeId` onto `overId`: it takes that card's place and its pinned state (dropping onto a pinned card pins). */
export function reorderCards(cards: readonly Card[], kind: CardKind, activeId: string, overId: string): Card[] {
  const vis = visibleCards(cards, kind);
  const from = vis.findIndex((c) => c.id === activeId), to = vis.findIndex((c) => c.id === overId);
  if (from < 0 || to < 0 || from === to) return [...cards];
  const moved = arrayMove(vis, from, to).map((c) => (c.id === activeId ? { ...c, pinned: vis[to].pinned } : c));
  const it = moved[Symbol.iterator]();
  // the kind's cards go back into the slots they occupied; the other kind keeps its positions
  return cards.map((c) => (c.kind === kind ? it.next().value! : c));
}

/** Case-insensitive, ё = е. */
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
export const matchesCard = (c: Pick<Card, 'title' | 'text'>, query: string) => {
  const q = norm(query.trim());
  return !q || norm(c.title).includes(q) || norm(c.text).includes(q);
};

// ---- dice from a chat log: "rolling 5d6 ( 2 + 4 + 3 ) = 9" (often split over lines) -> one line, read the Blades way.
export interface RollLabels { sum: string; best: string; crit: string; success: string; partial: string; fail: string }

/** Only the roll is rewritten; the "Name:" before it and the rest of the chat stay. Idempotent (output has no "rolling"). */
export const rollsInText = (x: string, L: RollLabels): string =>
  x.replace(/rolling\s+(\d*)d(\d+)\s*\(([\d\s+]+)\)\s*=\s*(\d+)/gi, (_, n, f, ds, sum) => {
    const d = ds.trim().split(/\s*\+\s*/).map(Number);
    const best = Math.max(...d), sixes = d.filter((v: number) => v === 6).length;
    const verdict = +f !== 6
      ? `${L.sum} ${sum}`
      : `${L.best} ${best} → ${sixes > 1 ? `6&6: ${L.crit}` : best === 6 ? `6: ${L.success}` : best >= 4 ? `4–5: ${L.partial}` : `1–3: ${L.fail}`}`;
    return `🎲 ${n || 1}d${f} → ${d.join(' ')} · ${verdict}`;
  });

// ---- note view blocks
export type Block =
  | { t: 'gap' | 'hr' }
  | { t: 'h3' | 'h4' | 'li' | 'p'; s: string }
  | { t: 'msg'; who: string; lines: string[] }
  | { t: 'roll'; who: string; die: string; dice: string; verdict: string; cls: 'rc' | 'r6' | 'r4' | 'r1' | '' };

const parseRoll = (who: string, body: string): Block | null => {
  const m = /^🎲\s*(\S+)\s*→\s*([\d ]+?)\s*·\s*(.*)$/.exec(body);
  if (!m) return null;
  const v = m[3], cls = /6&6/.test(v) ? 'rc' : /→\s*6:/.test(v) ? 'r6' : /4–5/.test(v) ? 'r4' : /1–3/.test(v) ? 'r1' : '';
  return { t: 'roll', who, die: m[1], dice: m[2], verdict: v.replace(/^[^→]*→\s*/, ''), cls };
};

/** Renders-nothing parse of the note text: [ Floor ] / # heading, [[ Room ]] / ## subheading, - bullets, rules, chat lines "Name:text", rolls. */
export function parseNote(x: string, L: RollLabels): Block[] {
  const out: Block[] = [];
  let who = '', msg: Extract<Block, { t: 'msg' }> | null = null, chat = false;
  for (const l of rollsInText(x, L).split('\n')) {
    let m: RegExpExecArray | null;
    if (!l.trim()) { msg = null; chat = false; out.push({ t: 'gap' }); continue; }
    if ((m = /^\s*\[\[\s*(.+?)\s*\]\]\s*$/.exec(l)) || (m = /^\s*##+\s+(.+)$/.exec(l))) { msg = null; chat = false; out.push({ t: 'h4', s: m[1] }); }
    else if ((m = /^\s*\[\s*(.+?)\s*\]\s*$/.exec(l)) || (m = /^\s*#\s+(.+)$/.exec(l))) { msg = null; chat = false; out.push({ t: 'h3', s: m[1] }); }
    else if (/^\s*[-=]{3,}\s*$/.test(l)) { msg = null; out.push({ t: 'hr' }); }
    else if ((m = /^\s*([^:\d+()=\s[][^:]{0,39}?)\s?:(?=\S)(.*)$/.exec(l))) {
      who = m[1].trim(); chat = true;
      const r = parseRoll(who, m[2].trim());
      if (r) { msg = null; out.push(r); } else { msg = { t: 'msg', who, lines: [m[2]] }; out.push(msg); }
    } else if (/^\s*🎲/.test(l) && parseRoll(who, l.trim())) { msg = null; out.push(parseRoll(who, l.trim())!); }
    else if (msg) msg.lines.push(l);
    else if (chat) { msg = { t: 'msg', who, lines: [l] }; out.push(msg); }
    else if ((m = /^\s*[-•]\s+(.*)$/.exec(l))) out.push({ t: 'li', s: m[1] });
    else out.push({ t: 'p', s: l });
  }
  return out;
}

// ---- floor plan geometry
export interface Box { x: number; y: number; w: number; h: number }
export const GRID = 20;
export const snap = (v: number, g = GRID) => Math.round(v / g) * g;

export function shapeBox(s: Shape): Box {
  switch (s.kind) {
    case 'room': case 'image': return { x: s.x, y: s.y, w: s.w, h: s.h };
    case 'wall': case 'door': case 'window':
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case 'pen': {
      const xs = s.points.map((p) => p[0]), ys = s.points.map((p) => p[1]), x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'text': return { x: s.x, y: s.y - 14, w: s.text.length * 8, h: 18 };
    case 'mark': return { x: s.x - 12, y: s.y - 12, w: 24, h: 24 };
  }
}
export function boundsOf(list: Shape[]): Box {
  const b = list.map(shapeBox), x = Math.min(...b.map((q) => q.x)), y = Math.min(...b.map((q) => q.y));
  return { x, y, w: Math.max(...b.map((q) => q.x + q.w)) - x, h: Math.max(...b.map((q) => q.y + q.h)) - y };
}
/** `o` shifted by (dx, dy). */
export function movedShape(o: Shape, dx: number, dy: number): Shape {
  if ('x1' in o) return { ...o, x1: o.x1 + dx, x2: o.x2 + dx, y1: o.y1 + dy, y2: o.y2 + dy };
  if (o.kind === 'pen') return { ...o, points: o.points.map((p) => [p[0] + dx, p[1] + dy] as [number, number]) };
  return { ...o, x: o.x + dx, y: o.y + dy };
}

/** View that shows every shape of the floor inside a W x H viewport. */
export function fitView(f: Floor, W: number, H: number) {
  if (!f.shapes.length) return { x: 40, y: 40, zoom: 1 };
  const b = boundsOf(f.shapes);
  const zoom = Math.min(1.5, Math.max(0.15, Math.min((W - 60) / Math.max(b.w, 1), (H - 60) / Math.max(b.h, 1))));
  return { zoom, x: (W - b.w * zoom) / 2 - b.x * zoom, y: (H - b.h * zoom) / 2 - b.y * zoom };
}

/** Text under a "[[ Room ]]" heading up to the next [ … ] heading; null when there is no such heading. */
export function roomText(text: string, name: string): string | null {
  const L = text.split('\n'), h = new RegExp('^\\s*\\[\\[\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\]\\]\\s*$', 'i');
  const i = L.findIndex((l) => h.test(l));
  if (i < 0) return null;
  const out: string[] = [];
  for (const l of L.slice(i + 1)) { if (/^\s*\[.*\]\s*$/.test(l)) break; out.push(l); }
  return out.join('\n').trim();
}

/** Floors `[ Name ]` and rooms `[[ Name ]]` from the note text: floor name -> room names (rooms before any floor heading go to `''`). */
export function headingsOf(text: string): Array<{ floor: string; rooms: string[] }> {
  const out: Array<{ floor: string; rooms: string[] }> = [];
  let cur: { floor: string; rooms: string[] } | undefined;
  for (const l of text.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^\s*\[\[\s*(.+?)\s*\]\]\s*$/.exec(l))) { cur ??= (out.push({ floor: '', rooms: [] }), out.at(-1)!); cur.rooms.push(m[1]); }
    else if ((m = /^\s*\[\s*(.+?)\s*\]\s*$/.exec(l))) {
      cur = out.find((f) => f.floor.toLowerCase() === m![1].toLowerCase());
      if (!cur) out.push((cur = { floor: m[1], rooms: [] }));
    }
  }
  return out;
}

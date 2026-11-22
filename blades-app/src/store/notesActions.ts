// Edits of note/rule cards (Notes and Rules tabs), floor plans and the biography. Same convention as actions.ts:
// every UI handler goes through one of these named functions.
import type { Card, CardImage, Floor, Shape } from '../model';
import { boundsOf, headingsOf, reorderCards, type CardKind } from '../engine/cards';
import { t } from '../i18n';
import { useStore } from './store';

const edit = (...a: Parameters<ReturnType<typeof useStore.getState>['edit']>) => useStore.getState().edit(...a);
const uuid = () => crypto.randomUUID();
const card = (d: { cards: Card[] }, id: string) => d.cards.find((c) => c.id === id);
const floorOf = (c: Card | undefined) => c?.plan && c.plan.floors[Math.min(c.plan.current, c.plan.floors.length - 1)];

// ---- cards
/** New card at the top of the list; returns its id. */
export function addCard(kind: CardKind): string {
  const id = uuid();
  edit((d) => void d.cards.unshift({ id, kind, title: '', text: '', pinned: false, images: [] }));
  return id;
}
export const setCard = (id: string, patch: { title?: string; text?: string }) =>
  edit((d) => void Object.assign(card(d, id) ?? {}, patch), `card:${id}:${Object.keys(patch)[0]}`);
export const togglePin = (id: string) => edit((d) => void (card(d, id) && (card(d, id)!.pinned = !card(d, id)!.pinned)));
export const deleteCard = (id: string) => edit((d) => void (d.cards = d.cards.filter((c) => c.id !== id)));
/** Drag-and-drop: `activeId` takes the place and the pinned state of `overId`. */
export const moveCard = (kind: CardKind, activeId: string, overId: string) =>
  edit((d) => void (d.cards = reorderCards(d.cards, kind, activeId, overId)));

// ---- images (data:image URLs, already shrunk by the UI)
export const addCardImage = (id: string, img: Omit<CardImage, 'id'>) => edit((d) => void card(d, id)?.images.push({ id: uuid(), ...img }));
export const removeCardImage = (id: string, imageId: string) =>
  edit((d) => { const c = card(d, id); if (c) c.images = c.images.filter((i) => i.id !== imageId); });

// ---- floor plan
export const addPlan = (id: string) =>
  edit((d) => { const c = card(d, id); if (c && !c.plan) c.plan = { floors: [{ id: uuid(), name: t('plan.floorN', { n: 1 }), shapes: [] }], current: 0, view: { x: 40, y: 40, zoom: 1 } }; });
export const removePlan = (id: string) => edit((d) => void delete card(d, id)?.plan);
export const setFloor = (id: string, index: number) => edit((d) => { const c = card(d, id); if (c?.plan) c.plan.current = Math.max(0, Math.min(index, c.plan.floors.length - 1)); });
export const addFloor = (id: string) =>
  edit((d) => {
    const p = card(d, id)?.plan;
    if (!p) return;
    p.floors.push({ id: uuid(), name: t('plan.floorN', { n: p.floors.length + 1 }), shapes: [] });
    p.current = p.floors.length - 1;
  });
export const renameFloor = (id: string, name: string) => edit((d) => void (floorOf(card(d, id)) && (floorOf(card(d, id))!.name = name)), `floor:${id}`);
/** Keeps at least one floor. */
export const removeFloor = (id: string) =>
  edit((d) => {
    const p = card(d, id)?.plan;
    if (!p || p.floors.length < 2) return;
    p.floors.splice(p.current, 1);
    p.current = Math.min(p.current, p.floors.length - 1);
  });
/** Adds a shape on the current floor (new ones go on top; images go underneath). */
export const addShape = (id: string, s: Shape) =>
  edit((d) => { const f = floorOf(card(d, id)); if (f) s.kind === 'image' ? f.shapes.unshift(s) : f.shapes.push(s); });
export const replaceShape = (id: string, s: Shape, key?: string) =>
  edit((d) => { const f = floorOf(card(d, id)); const i = f?.shapes.findIndex((x) => x.id === s.id) ?? -1; if (f && i >= 0) f.shapes[i] = s; }, key);
export const removeShape = (id: string, shapeId: string) =>
  edit((d) => { const f = floorOf(card(d, id)); if (f) f.shapes = f.shapes.filter((x) => x.id !== shapeId); });

/** Floors and rooms from `[ Floor ]` / `[[ Room ]]` headings of the text. Returns the number of rooms added (-1: no headings). */
export function planFromText(id: string): number {
  let added = -1;
  edit((d) => {
    const c = card(d, id);
    if (!c) return;
    const heads = headingsOf(c.text);
    if (!heads.length) return;
    added = 0;
    c.plan ??= { floors: [{ id: uuid(), name: t('plan.floorN', { n: 1 }), shapes: [] }], current: 0, view: { x: 40, y: 40, zoom: 1 } };
    const p = c.plan;
    for (const h of heads) {
      let f: Floor | undefined = h.floor ? p.floors.find((x) => x.name.toLowerCase() === h.floor.toLowerCase()) : p.floors[Math.min(p.current, p.floors.length - 1)];
      if (!f) {
        const first = p.floors[0];
        if (p.floors.length === 1 && !first.shapes.length && first.name === t('plan.floorN', { n: 1 })) { first.name = h.floor; f = first; }
        else p.floors.push((f = { id: uuid(), name: h.floor, shapes: [] }));
      }
      const have = new Set(f.shapes.flatMap((s) => (s.kind === 'room' ? [s.label.toLowerCase()] : [])));
      const y0 = f.shapes.length ? boundsOf(f.shapes).y + boundsOf(f.shapes).h + 40 : 0;
      let n = 0;
      for (const label of h.rooms) {
        if (have.has(label.toLowerCase())) continue;
        have.add(label.toLowerCase());
        f.shapes.push({ id: uuid(), kind: 'room', x: (n % 4) * 200, y: y0 + Math.floor(n / 4) * 140, w: 180, h: 120, label });
        n++; added++;
      }
    }
  });
  return added;
}

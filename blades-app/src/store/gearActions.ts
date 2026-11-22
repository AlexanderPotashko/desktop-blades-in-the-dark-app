// Gear edits (items, money, load, contents, properties). Workshop projects and moves are in workshopActions.ts.
// Same shape for gear items, workshop equipment (Item.place 'workshop') and projects (WorkItem): `find` looks in both lists.
import type { Draft } from 'immer';
import { breakMajor, joinMinor } from '../engine/money';
import { contentText, getLang } from '../i18n';
import { Item, type Character, type ItemProps, type Slot } from '../model';
import { itemDefs } from './content';
import { useStore } from './store';

const edit = (...a: Parameters<ReturnType<typeof useStore.getState>['edit']>) => useStore.getState().edit(...a);
const uuid = () => crypto.randomUUID();

type Doc = Draft<Character>;
export type Thing = Character['items'][number] | Character['workshop'][number];
export const findThing = (d: Pick<Character, 'items' | 'workshop'>, id: string): Thing | undefined =>
  d.items.find((i) => i.id === id) ?? d.workshop.find((w) => w.id === id);
const item = (d: Doc, id: string) => d.items.find((i) => i.id === id);

/** Book contents of an item (localized list), empty for custom items. */
export const bookContents = (i: Thing): string[] => ('bookId' in i && i.bookId ? contentText(getLang(), i.bookId)?.list ?? [] : []);

// ---- add / remove
export function addBookItem(bookId: string, place: 'gear' | 'workshop' = 'gear') {
  const def = itemDefs[bookId];
  if (!def) return;
  edit((d) => {
    d.items.push(Item.parse({
      id: uuid(), bookId, place, load: def.load, carried: place === 'gear' ? 1 : 0,
      slots: def.bandolierSlots ? Array.from({ length: def.bandolierSlots }, () => ({ name: '' })) : undefined,
    }));
  });
}
export const addCustomItem = (place: 'gear' | 'workshop' = 'gear') =>
  edit((d) => void d.items.push(Item.parse({ id: uuid(), place, load: 0, carried: place === 'gear' ? 1 : 0 })));
export const removeItem = (id: string) =>
  edit((d) => {
    d.items = d.items.filter((i) => i.id !== id);
    delete d.armorUsed[id];
    for (const i of d.items) for (const s of i.slots ?? []) if (s.itemId === id) delete s.itemId;
  });

// ---- fields
export function setItemName(id: string, name: string, bookName?: string) {
  edit((d) => {
    const i = item(d, id);
    if (!i) return;
    if (i.bookId && (name === '' || name === bookName)) delete i.name;
    else i.name = name;
  }, `item:${id}:name`);
}
export const setQty = (id: string, qty: number) =>
  edit((d) => {
    const i = item(d, id);
    if (i) {
      i.qty = Math.max(1, Math.floor(qty) || 1);
      i.carried = Math.min(i.carried, i.qty);
    }
  }, `item:${id}:qty`);
export const setCarried = (id: string, n: number) =>
  edit((d) => {
    const i = item(d, id);
    if (i) i.carried = Math.max(0, Math.min(i.qty, Math.floor(n) || 0));
  }, `item:${id}:carried`);
/** Single item: with you <-> at base. */
export const toggleBase = (id: string) =>
  edit((d) => {
    const i = item(d, id);
    if (i) i.carried = i.carried > 0 ? 0 : i.qty;
  });
export const setLoad = (id: string, n: number) =>
  edit((d) => {
    const i = findThing(d, id);
    if (i) i.load = Math.max(0, Math.floor(n) || 0);
  }, `item:${id}:load`);
export const toggleOpen = (id: string) =>
  edit((d) => {
    const i = findThing(d, id);
    if (i) i.open = !i.open;
  });
export const setNote = (id: string, v: string) =>
  edit((d) => {
    const i = findThing(d, id);
    if (i) i.note = v;
  }, `item:${id}:note`);

/** `undefined` clears an optional property. */
export const setProps = (id: string, patch: { [K in keyof ItemProps]?: ItemProps[K] | undefined }) =>
  edit((d) => {
    const i = findThing(d, id);
    if (!i) return;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (i.props as Record<string, unknown>)[k];
      else (i.props as Record<string, unknown>)[k] = v;
    }
  }, `item:${id}:p:${Object.keys(patch)[0]}`);
export const toggleFlaw = (id: string, flaw: string) =>
  edit((d) => {
    const i = findThing(d, id);
    if (!i) return;
    const f = i.props.flaws;
    const at = f.indexOf(flaw);
    if (at >= 0) f.splice(at, 1);
    else f.push(flaw);
  });
/** Spend one use. */
export const useOnce = (id: string) =>
  edit((d) => {
    const i = findThing(d, id);
    if (i) i.props.usesLeft = Math.max(0, (i.props.usesLeft ?? i.props.uses ?? 0) - 1);
  });

// ---- contents: book list is the default; the first edit makes it an own copy.
// Rows of the not-yet-copied book list are addressed as `#<index>`.
type Sub = { id: string; name: string; qty?: number };
const ensureSub = (i: Thing): Sub[] => (i.sub ??= bookContents(i).map((name) => ({ id: uuid(), name })));
const pick = (i: Thing, key: string) => (key.startsWith('#') ? ensureSub(i)[+key.slice(1)] : ensureSub(i).find((x) => x.id === key));
export const addSub = (id: string) =>
  edit((d) => {
    const i = findThing(d, id);
    if (i) ensureSub(i).push({ id: uuid(), name: '' });
  });
export const setSub = (id: string, key: string, patch: { name?: string; qty?: number | undefined }) =>
  edit((d) => {
    const i = findThing(d, id);
    const s = i && pick(i, key);
    if (!s) return;
    if (patch.name !== undefined) s.name = patch.name;
    if ('qty' in patch) {
      if (patch.qty === undefined) delete s.qty;
      else s.qty = Math.max(0, Math.floor(patch.qty) || 0);
    }
  }, `sub:${id}:${key}`);
export const removeSub = (id: string, key: string) =>
  edit((d) => {
    const i = findThing(d, id);
    const s = i && pick(i, key);
    if (i && s) i.sub = ensureSub(i).filter((x) => x !== s);
  });
/** Bandolier slot: name, quantity, link to a stock item (own-items mode). */
export const setSlot = (id: string, at: number, patch: Partial<Slot> & { qty?: number | undefined }) =>
  edit((d) => {
    const i = item(d, id);
    const s = i?.slots?.[at];
    if (!s) return;
    if (patch.name !== undefined) s.name = patch.name;
    if ('itemId' in patch) patch.itemId ? (s.itemId = patch.itemId) : delete s.itemId;
    if ('qty' in patch) patch.qty === undefined ? delete s.qty : (s.qty = Math.max(0, Math.floor(patch.qty) || 0));
  }, `slot:${id}:${at}`);

// ---- load level and money
export const setLoadLevel = (v: Character['load']) => edit((d) => void (d.load = v));
export const setCoins = (n: number) => edit((d) => void (d.money.coins = Math.max(0, Math.min(4, n))));
export const setStash = (n: number) => edit((d) => void (d.money.stash = Math.max(0, Math.min(40, n))));
export const setMajor = (n: number) => edit((d) => void (d.money.major = Math.max(0, Math.floor(n) || 0)), 'money:major');
export const setMinor = (n: number) => edit((d) => void (d.money.minor = Math.max(0, Math.floor(n) || 0)), 'money:minor');
export const breakOne = (rate: number) => edit((d) => void (d.money = breakMajor(d.money, rate)));
export const joinOne = (rate: number) => edit((d) => void (d.money = joinMinor(d.money, rate)));

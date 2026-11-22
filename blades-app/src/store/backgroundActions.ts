// Edits of the Biography tab: heritage / background / vice, look, notes, friends and rivals.
import { useStore } from './store';

const edit = (...a: Parameters<ReturnType<typeof useStore.getState>['edit']>) => useStore.getState().edit(...a);
const uuid = () => crypto.randomUUID();

export type OriginKey = 'heritage' | 'background' | 'vice';

/** Pick a book entry (`bookId`) or write your own (`name` only). An empty choice clears both; the note stays. */
export const setOrigin = (key: OriginKey, v: { bookId?: string; name?: string }) =>
  edit((d) => {
    const o = d[key];
    delete o.bookId;
    delete o.name;
    if (v.bookId) o.bookId = v.bookId;
    else if (v.name !== undefined) o.name = v.name;
  }, `origin:${key}`);
/** Custom name, or a rename of the book entry when `bookId` is set. */
export const setOriginName = (key: OriginKey, name: string) => edit((d) => void (d[key].name = name), `originName:${key}`);
export const setOriginNote = (key: OriginKey, note: string) => edit((d) => void (d[key].note = note), `originNote:${key}`);
export const setBio = (k: 'look' | 'notes', v: string) => edit((d) => void (d[k] = v), k);

/** Playbook friend/rival from the book (starts as a friend), or a custom one when `bookId` is absent. */
export function addContact(bookId?: string): string {
  const id = uuid();
  edit((d) => {
    if (bookId && d.contacts.some((c) => c.bookId === bookId)) return;
    d.contacts.push({ id, ...(bookId ? { bookId } : { name: '' }), rel: 'up', note: '' });
  });
  return id;
}
export const flipContact = (id: string) => edit((d) => { const c = d.contacts.find((x) => x.id === id); if (c) c.rel = c.rel === 'up' ? 'down' : 'up'; });
export const setContact = (id: string, patch: { name?: string; note?: string }) =>
  edit((d) => void Object.assign(d.contacts.find((x) => x.id === id) ?? {}, patch), `contact:${id}:${Object.keys(patch)[0]}`);
export const removeContact = (id: string) => edit((d) => void (d.contacts = d.contacts.filter((c) => c.id !== id)));

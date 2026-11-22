// Workshop edits: projects (WorkItem) and equipment (Item.place 'workshop'), plus the moves between workshop and gear.
import { Item, WorkItem } from '../model';
import { useStore } from './store';

const edit = (...a: Parameters<ReturnType<typeof useStore.getState>['edit']>) => useStore.getState().edit(...a);
const uuid = () => crypto.randomUUID();
const num = (v: number | undefined) => (v === undefined ? undefined : Math.max(0, Math.floor(v) || 0));

export const addProject = () => edit((d) => void d.workshop.push(WorkItem.parse({ id: uuid(), name: '' })));
export const setProject = (id: string, patch: { name?: string; done?: number | undefined; total?: number | undefined; qty?: number }) =>
  edit((d) => {
    const w = d.workshop.find((x) => x.id === id);
    if (!w) return;
    if (patch.name !== undefined) w.name = patch.name;
    if (patch.qty !== undefined) w.qty = num(patch.qty)!;
    for (const k of ['done', 'total'] as const) {
      if (!(k in patch)) continue;
      const v = num(patch[k]);
      if (v === undefined) delete w[k];
      else w[k] = v;
    }
  }, `project:${id}:${Object.keys(patch)[0]}`);
export const removeProject = (id: string) => edit((d) => void (d.workshop = d.workshop.filter((w) => w.id !== id)));

/** Finished project -> custom gear item, left at base. */
export const projectToGear = (id: string) =>
  edit((d) => {
    const w = d.workshop.find((x) => x.id === id);
    if (!w) return;
    d.workshop = d.workshop.filter((x) => x.id !== id);
    d.items.push(Item.parse({
      id: w.id, name: w.name, place: 'gear', load: w.load, qty: Math.max(1, w.qty), carried: 0,
      open: w.open, note: w.note, props: w.props, sub: w.sub,
    }));
  });

/** Own gear item -> project (book items cannot be projects). */
export const gearToProject = (id: string) =>
  edit((d) => {
    const i = d.items.find((x) => x.id === id && x.place === 'gear' && !x.bookId);
    if (!i) return;
    d.items = d.items.filter((x) => x.id !== id);
    delete d.armorUsed[id];
    d.workshop.push(WorkItem.parse({
      id: i.id, name: i.name ?? '', qty: i.qty, load: i.load, open: i.open, note: i.note, props: i.props, sub: i.sub ?? [],
    }));
  });

/** Gear <-> workshop equipment: the same Item changes place; in the workshop nothing is carried, back in gear it waits at base. */
export const moveItem = (id: string, place: 'gear' | 'workshop') =>
  edit((d) => {
    const i = d.items.find((x) => x.id === id);
    if (!i || i.place === place) return;
    i.place = place;
    i.carried = 0;
    delete d.armorUsed[id];
  });

// "p. N" links from tips and rules text: `openBookPage(n)` asks the rulebook view to show book page n.
// The shell subscribes (to switch to the "Рулбук" tab); the view reads the pending request when it mounts.
type Req = { book: number };
let pending: Req | null = null;
const listeners = new Set<(r: Req) => void>();

export function openBookPage(book: number): void {
  pending = { book };
  listeners.forEach((l) => l(pending!));
}

/** Returns an unsubscribe function. */
export function subscribeOpenBookPage(cb: (r: Req) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The latest request not yet consumed by a view. */
export function takePendingPage(): Req | null {
  const r = pending;
  pending = null;
  return r;
}

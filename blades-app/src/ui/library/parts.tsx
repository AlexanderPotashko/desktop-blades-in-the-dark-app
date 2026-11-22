// Small shared bits of the library screens.
import { useState, type ReactNode } from 'react';
import { getLang, t } from '../../i18n';

export const fmtDate = (iso: string | Date | null | undefined): string => {
  const d = iso instanceof Date ? iso : iso ? new Date(iso) : null;
  return d && !Number.isNaN(+d) ? d.toLocaleString(getLang(), { dateStyle: 'short', timeStyle: 'short' }) : '';
};

/** Two-step button: the first click asks "sure?", the second does it. No modal, nothing to dismiss by accident. */
export function Confirm({ label, ask, onYes, danger }: { label: string; ask: string; onYes: () => void | Promise<void>; danger?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className={danger ? 'danger' : ''} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="confirm" role="alertdialog">
      <span className="small warn">{ask}</span>
      <button className="danger" onClick={() => { setAsking(false); void onYes(); }}>{t('yes')}</button>
      <button onClick={() => setAsking(false)}>{t('no')}</button>
    </span>
  );
}

export function Msg({ children }: { children: ReactNode }) {
  return children ? <div className="small" role="status" data-testid="lib-msg">{children}</div> : null;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

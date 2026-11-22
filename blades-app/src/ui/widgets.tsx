import { t, type Key } from '../i18n';

/** Hover tip: shown by CSS on `body.tips [data-tip]` (the ? button in the header). */
export const tip = (key: Key, vars?: Record<string, string | number>) => ({ 'data-tip': t(key, vars) });

/** Row of boxes; clicking the last filled one clears it (prototype behaviour). */
export function Boxes({ n, value, onChange, red, label }: { n: number; value: number; onChange: (v: number) => void; red?: boolean; label?: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          role="checkbox"
          aria-checked={i < value}
          aria-label={label ? `${label} ${i + 1}` : undefined}
          tabIndex={0}
          className={`box${red ? ' red' : ''}${i < value ? ' on' : ''}`}
          onClick={() => onChange(i + 1 === value ? i : i + 1)}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onChange(i + 1 === value ? i : i + 1))}
        />
      ))}
    </>
  );
}

/** Skill dots 1..max; clicking the current rating lowers it by one. */
export function Dots({ value, max = 4, onChange, label }: { value: number; max?: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="row dots" style={{ gap: 4 }}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          role="checkbox"
          aria-checked={i < value}
          aria-label={`${label} ${i + 1}`}
          tabIndex={0}
          className={`dot${i < value ? ' on' : ''}${i === 0 ? ' first' : ''}`}
          onClick={() => onChange(i + 1 === value ? i : i + 1)}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onChange(i + 1 === value ? i : i + 1))}
        />
      ))}
    </span>
  );
}

/** Four-segment clock (healing). */
export function Clock({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <svg className="clock" viewBox="-1.1 -1.1 2.2 2.2" role="group" aria-label={label}>
      {[0, 1, 2, 3].map((i) => {
        const a0 = (i * Math.PI) / 2 - Math.PI / 2, a1 = a0 + Math.PI / 2;
        return (
          <path
            key={i}
            data-seg={i + 1}
            role="checkbox"
            aria-checked={i < value}
            aria-label={`${label} ${i + 1}`}
            d={`M0 0 L${Math.cos(a0)} ${Math.sin(a0)} A1 1 0 0 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`}
            className={i < value ? 'seg on' : 'seg'}
            onClick={() => onChange(i + 1 === value ? i : i + 1)}
          />
        );
      })}
    </svg>
  );
}

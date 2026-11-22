// Header dropdown: the most recently edited sheets, one click to switch (pending edits are saved first).
import { useCallback, useEffect, useState } from 'react';
import * as db from '../../api/db';
import { t } from '../../i18n';
import { openCharacter } from '../../store/library';
import { useStore } from '../../store/store';

export function QuickSwitch() {
  const id = useStore((s) => s.doc?.id);
  const [rows, setRows] = useState<db.CharacterRow[]>([]);
  const load = useCallback(() => void db.listCharacters().then((r) => setRows(r.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12))).catch(() => {}), []);
  useEffect(load, [load, id]);
  if (rows.length < 2) return null; // one sheet: nothing to switch to
  return (
    <select className="qs" aria-label={t('library.switch')} title={t('library.switch')} value={id ?? ''} data-testid="quick-switch"
      onMouseDown={load} onFocus={load} onChange={(e) => void openCharacter(e.target.value)}>
      {rows.map((r) => <option key={r.id} value={r.id}>{r.name || t('library.unnamed')}{r.alias ? ` «${r.alias}»` : ''}</option>)}
    </select>
  );
}

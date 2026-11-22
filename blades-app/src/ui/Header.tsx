import { t } from '../i18n';
import { bookName } from '../store/content';
import { setDay, setField } from '../store/actions';
import { useRules, useStore } from '../store/store';
import { TABS, useUi, type Tab } from '../store/ui';

export function Header() {
  const doc = useStore((s) => s.doc)!;
  const { saveState, past, future } = useStore();
  const rules = useRules();
  const { tab, tips, set } = useUi();
  const go = (x: Tab) => set({ tab: x });
  return (
    <header>
      <h1>{bookName(doc.playbookId)}</h1>
      <input aria-label={t('name')} data-testid="name" value={doc.name} placeholder={t('name')} style={{ width: 180 }} onChange={(e) => setField('name', e.target.value)} />
      <input aria-label={t('alias')} value={doc.alias} placeholder={t('alias')} style={{ width: 110 }} onChange={(e) => setField('alias', e.target.value)} />
      {rules.dayCounter && (
        <span className="row" style={{ gap: 4 }} data-tip={t('tip.day')}>
          {t('day')}<input type="number" min={1} value={doc.day} style={{ width: 62 }} onChange={(e) => setDay(+e.target.value)} />
        </span>
      )}
      <nav className="tabs">
        {TABS.map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => go(x)}>{t(`tab.${x}`)}</button>
        ))}
      </nav>
      <button onClick={() => useStore.getState().undo()} disabled={!past.length} title={t('undo')} aria-label={t('undo')}>↶</button>
      <button onClick={() => useStore.getState().redo()} disabled={!future.length} title={t('redo')} aria-label={t('redo')}>↷</button>
      <span className={`save ${saveState}`} data-testid="save-state">{t(`save.${saveState}`)}</span>
      <button className={tab === 'settings' ? 'on' : ''} onClick={() => go(tab === 'settings' ? 'sheet' : 'settings')} title={t('settings')} aria-label={t('settings')}>⚙</button>
      <button className={tips ? 'on' : ''} onClick={() => set({ tips: !tips })} title={t('tips.toggle')} aria-label={t('tips.toggle')} aria-pressed={tips}>?</button>
    </header>
  );
}

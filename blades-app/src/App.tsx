import { useEffect, useState } from 'react';
import { t } from './i18n';
import { boot } from './store/session';
import { installShortcuts, useStore } from './store/store';
import { useUi } from './store/ui';
import { Header } from './ui/Header';
import { Settings } from './ui/Settings';
import { Gear } from './ui/gear/Gear';
import { Sheet } from './ui/sheet/Sheet';
import { Workshop } from './ui/workshop/Workshop';
import { RulebookView, subscribeOpenBookPage } from './rulebook/RulebookView';

export default function App() {
  const doc = useStore((s) => s.doc);
  const { tab, tips, lang } = useUi();
  const [error, setError] = useState('');

  useEffect(() => {
    boot().catch((e) => setError(String(e?.message ?? e)));
    const off = installShortcuts();
    // "p. N" links from tips switch to the Rulebook tab
    const offRb = subscribeOpenBookPage(() => useUi.getState().set({ tab: 'rulebook' }));
    // best effort on close: write pending edits and a closing revision
    const bye = () => void useStore.getState().flush('close');
    window.addEventListener('beforeunload', bye);
    return () => {
      off();
      offRb();
      window.removeEventListener('beforeunload', bye);
    };
  }, []);
  useEffect(() => void document.body.classList.toggle('tips', tips), [tips]);
  useEffect(() => void (document.documentElement.lang = lang), [lang]);

  if (error) return <main><p className="warn">{error}</p></main>;
  if (!doc) return <main><p className="small">{t('loading')}</p></main>;
  return (
    <>
      <Header />
      {tab === 'sheet' ? <Sheet /> : tab === 'gear' ? <Gear /> : tab === 'workshop' ? <Workshop /> : tab === 'settings' ? <Settings /> : tab === 'rulebook' ? <main><RulebookView /></main> : (
        <main><section><h2>{t(`tab.${tab}`)}</h2><p className="small">{t('tab.soon')}</p></section></main>
      )}
    </>
  );
}

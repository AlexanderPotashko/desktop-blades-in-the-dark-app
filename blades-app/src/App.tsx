import { useEffect, useState } from 'react';
import { t } from './i18n';
import { boot } from './store/session';
import { installShortcuts, useStore } from './store/store';
import { TABS, useUi, type Tab } from './store/ui';
import { Header } from './ui/Header';
import { Settings } from './ui/Settings';
import { Sheet } from './ui/sheet/Sheet';
import { Notes } from './ui/notes/Notes';
import { Background } from './ui/background/Background';
import { RulebookView, subscribeOpenBookPage } from './rulebook/RulebookView';

export default function App() {
  const doc = useStore((s) => s.doc);
  const { tab, tips, lang } = useUi();
  const [error, setError] = useState('');

  useEffect(() => {
    boot().then(() => {
      // ?tab=notes opens that tab at start (screenshots, links)
      const q = new URLSearchParams(location.search).get('tab');
      if (q && (TABS as readonly string[]).includes(q)) useUi.getState().set({ tab: q as Tab });
    }).catch((e) => setError(String(e?.message ?? e)));
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
      {tab === 'sheet' ? <Sheet /> : tab === 'settings' ? <Settings /> : tab === 'rulebook' ? <main><RulebookView /></main>
        : tab === 'notes' ? <Notes kind="note" /> : tab === 'rules' ? <Notes kind="rule" /> : tab === 'background' ? <Background /> : (
        <main><section><h2>{t(`tab.${tab}`)}</h2><p className="small">{t('tab.soon')}</p></section></main>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { t } from './i18n';
import { boot } from './store/session';
import { installShortcuts, useStore } from './store/store';
import { useUi } from './store/ui';
import { Header } from './ui/Header';
import { Settings } from './ui/Settings';
import { Gear } from './ui/gear/Gear';
import { Sheet } from './ui/sheet/Sheet';
import { Workshop } from './ui/workshop/Workshop';
import { Notes } from './ui/notes/Notes';
import { Background } from './ui/background/Background';
import { RulebookView, subscribeOpenBookPage } from './rulebook/RulebookView';
import { Wizard } from './wizard/Wizard';

export default function App() {
  const doc = useStore((s) => s.doc);
  const { tab, tips, lang } = useUi();
  const [error, setError] = useState('');

  useEffect(() => {
    boot().catch((e) => setError(String(e?.message ?? e)));
    const off = installShortcuts();
    // "p. N" links from tips switch to the Rulebook tab
    const offRb = subscribeOpenBookPage(() => useUi.getState().set({ tab: 'rulebook' }));
    // On close: hold the window until pending edits and a closing revision are written.
    const flushClose = () => useStore.getState().flush('close');
    let offClose: (() => void) | undefined;
    let gone = false;
    if ('__TAURI_INTERNALS__' in window) {
      const w = getCurrentWindow();
      void w
        .onCloseRequested(async (e) => {
          e.preventDefault();
          try {
            await flushClose();
          } finally {
            await w.destroy(); // close even if the save failed: the error is already shown and the doc is on disk as of the last good save
          }
        })
        .then((un) => (gone ? un() : (offClose = un)));
    } else {
      // dev browser fallback: best effort, cannot await
      window.addEventListener('beforeunload', flushClose);
      offClose = () => window.removeEventListener('beforeunload', flushClose);
    }
    return () => {
      off();
      offRb();
      gone = true;
      offClose?.();
    };
  }, []);
  useEffect(() => void document.body.classList.toggle('tips', tips), [tips]);
  useEffect(() => void (document.documentElement.lang = lang), [lang]);

  if (error) return <main><p className="warn">{error}</p></main>;
  if (!doc) return <main><p className="small">{t('loading')}</p></main>;
  return (
    <>
      <Header />
      <Wizard />
      {tab === 'sheet' ? <Sheet /> : tab === 'gear' ? <Gear /> : tab === 'workshop' ? <Workshop /> : tab === 'settings' ? <Settings /> : tab === 'rulebook' ? <main><RulebookView /></main>
        : tab === 'notes' ? <Notes kind="note" /> : tab === 'rules' ? <Notes kind="rule" /> : tab === 'background' ? <Background /> : (
        <main><section><h2>{t(`tab.${tab}`)}</h2><p className="small">{t('tab.soon')}</p></section></main>
      )}
    </>
  );
}

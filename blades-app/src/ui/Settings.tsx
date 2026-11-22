import { useState } from 'react';
import { LANGS, t, type Lang } from '../i18n';
import { bookName, playbookList } from '../store/content';
import { setRule } from '../store/actions';
import { useRawRules, useStore } from '../store/store';
import { clearRulesOverride, setCampaignRule } from '../store/library';
import { createCharacter, importFromPrototype } from '../store/session';
import { useUi } from '../store/ui';
import { RulesEditor } from './RulesEditor';

export function Settings() {
  const sheetRules = useRawRules();
  const { baseRules, campaignId } = useStore();
  const overridden = Object.keys(useStore((s) => s.doc?.rulesOverride) ?? {});
  const { lang, tips, set } = useUi();
  const [pb, setPb] = useState(playbookList[0]?.id ?? '');
  const [msg, setMsg] = useState('');
  // In a campaign the rules edited here are the campaign's, unless "only this sheet" is chosen.
  const [onlySheet, setOnlySheet] = useState(false);
  const toCampaign = !!campaignId && !onlySheet;

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const warnings = await importFromPrototype(await f.text());
      setMsg(t('settings.imported', { n: warnings.length }));
    } catch (e) {
      setMsg(t('settings.importFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <main id="settings">
      <section>
        <h2>{t('settings')}</h2>
        {campaignId && (
          <div data-testid="rules-target">
            <h3>{t('settings.target')}</h3>
            <div className="row">
              <label className="chk"><input type="radio" name="target" checked={!onlySheet} onChange={() => setOnlySheet(false)} /> {t('settings.target.campaign')}</label>
              <label className="chk"><input type="radio" name="target" checked={onlySheet} onChange={() => setOnlySheet(true)} /> {t('settings.target.sheet')}</label>
            </div>
            <div className="small">{t(onlySheet ? 'settings.target.sheetHint' : 'settings.target.campaignHint')}</div>
            {toCampaign && overridden.length > 0 && (
              <div className="small warn" data-testid="override-warn">
                {t('settings.overridden', { keys: overridden.join(', ') })} <button className="mini" onClick={clearRulesOverride}>{t('settings.overridden.clear')}</button>
              </div>
            )}
          </div>
        )}
        <RulesEditor r={toCampaign ? baseRules : sheetRules} set={toCampaign ? setCampaignRule : setRule} />

        <h3>{t('language')}</h3>
        <select aria-label={t('language')} value={lang} onChange={(e) => set({ lang: e.target.value as Lang })}>
          {LANGS.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
        </select>

        <h3>{t('settings.tips')}</h3>
        <label className="chk"><input type="checkbox" checked={tips} onChange={(e) => set({ tips: e.target.checked })} /> {t('settings.tipsHint')}</label>

        <h3>{t('settings.data')}</h3>
        <div className="row">
          <select aria-label={t('settings.newCharacter')} value={pb} onChange={(e) => setPb(e.target.value)}>
            {playbookList.map((p) => <option key={p.id} value={p.id}>{bookName(p.id)}</option>)}
          </select>
          <button onClick={() => void createCharacter(pb)}>{t('settings.newCharacter')}</button>
          <label style={{ margin: 0 }}>
            <button type="button" onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>{t('settings.import')}</button>
            <input type="file" accept=".json,application/json" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <div className="small" data-testid="import-msg">{msg}</div>
      </section>
    </main>
  );
}

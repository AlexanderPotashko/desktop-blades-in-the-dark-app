import { useState, type ReactNode } from 'react';
import type { TableRules } from '../model';
import { LANGS, t, type Lang } from '../i18n';
import { bookName, playbookList } from '../store/content';
import { setRule } from '../store/actions';
import { useRawRules } from '../store/store';
import { createCharacter, importFromPrototype } from '../store/session';
import { useUi } from '../store/ui';

const STAGES = ['creation', 'play', 'mastery', 'free'] as const;
const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(+v) || min));

function Chk({ checked, onChange, children, sub }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <label className="chk"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}</label>
      {sub}
    </>
  );
}

function DowntimeOptions({ r }: { r: TableRules }) {
  const set = (options: TableRules['downtime']['options']) => setRule('downtime', { ...r.downtime, options });
  const patch = (i: number, p: Partial<TableRules['downtime']['options'][number]>) => set(r.downtime.options.map((o, j) => (j === i ? { ...o, ...p } : o)));
  const add = (name: string, healing: number, stressRelief: number) => set([...r.downtime.options, { id: crypto.randomUUID(), name, healing, stressRelief }]);
  return (
    <div className="sub2" style={{ display: 'grid' }} data-testid="downtime-options">
      {r.downtime.options.map((o, i) => (
        <div key={o.id} className="row">
          <input value={o.name} style={{ width: 200 }} aria-label={t('settings.optName')} onChange={(e) => patch(i, { name: e.target.value })} />
          {t('healing')} <input type="number" min={0} max={4} value={o.healing} style={{ width: 60 }} onChange={(e) => patch(i, { healing: num(e.target.value, 0, 4) })} />
          {t('stress')} −<input type="number" min={0} max={20} value={o.stressRelief} style={{ width: 60 }} onChange={(e) => patch(i, { stressRelief: num(e.target.value, 0, 20) })} />
          <button className="mini" onClick={() => set(r.downtime.options.filter((_, j) => j !== i))} aria-label={t('remove')}>✕</button>
        </div>
      ))}
      <div className="row">
        <button onClick={() => add(t('settings.opt.a'), 1, 1)}>{t('settings.optAddA')}</button>
        <button onClick={() => add(t('settings.opt.b'), 0, 2)}>{t('settings.optAddB')}</button>
        <button onClick={() => add('', 0, 0)}>{t('settings.optAdd')}</button>
      </div>
    </div>
  );
}

export function Settings() {
  const r = useRawRules();
  const book = r.mode === 'book';
  const { lang, tips, set } = useUi();
  const [pb, setPb] = useState(playbookList[0]?.id ?? '');
  const [msg, setMsg] = useState('');

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
        <h3>{t('settings.rules')}</h3>
        <div className="row">
          {(['book', 'custom'] as const).map((m) => (
            <label key={m} className="chk"><input type="radio" name="mode" value={m} checked={r.mode === m} onChange={() => setRule('mode', m)} /> {t(`settings.mode.${m}`)}</label>
          ))}
        </div>
        <div className="small">{t(book ? 'settings.modeInfo.book' : 'settings.modeInfo.custom')}</div>
        <fieldset className={`rules${book ? ' off' : ''}`} disabled={book}>
          <div className="small">{t('settings.checkHint')}</div>
          <Chk checked={r.money.book} onChange={(v) => setRule('money', { ...r.money, book: v })} sub={!r.money.book && (
            <div className="sub2">
              {t('settings.currency')} {t('settings.major')} <input value={r.money.major} style={{ width: 120 }} onChange={(e) => setRule('money', { ...r.money, major: e.target.value })} />
              {t('settings.minor')} <input value={r.money.minor} style={{ width: 130 }} onChange={(e) => setRule('money', { ...r.money, minor: e.target.value })} />
              {t('settings.rate')} <input type="number" min={1} value={r.money.rate} style={{ width: 70 }} onChange={(e) => setRule('money', { ...r.money, rate: num(e.target.value, 1, 1000) })} />
            </div>
          )}>{t('settings.money')}</Chk>
          <Chk checked={r.stress.book} onChange={(v) => setRule('stress', { ...r.stress, book: v })} sub={!r.stress.book && (
            <div className="sub2">{t('settings.stressBoxes')} <input type="number" min={1} max={20} value={r.stress.boxes} style={{ width: 70 }} onChange={(e) => setRule('stress', { ...r.stress, boxes: num(e.target.value, 1, 20) })} /></div>
          )}>{t('settings.stress')}</Chk>
          <div className="sub2">{t('settings.xpBoxes')} <input type="number" min={1} max={40} value={r.playbookXpBoxes} style={{ width: 70 }} onChange={(e) => setRule('playbookXpBoxes', num(e.target.value, 1, 40))} /> <span className="small">{t('settings.xpBoxesHint')}</span></div>
          <Chk checked={r.load} onChange={(v) => setRule('load', v)}>{t('settings.load')}</Chk>
          <Chk checked={r.specialArmor === 'shared'} onChange={(v) => setRule('specialArmor', v ? 'shared' : 'per-talent')}>{t('settings.specialArmor')}</Chk>
          <Chk checked={r.bandolier === 'book'} onChange={(v) => setRule('bandolier', v ? 'book' : 'own-items')}>{t('settings.bandolier')}</Chk>
          <Chk checked={r.presets === 'book'} onChange={(v) => setRule('presets', v ? 'book' : 'book+own')}>{t('settings.presets')}</Chk>
          <Chk checked={r.dayCounter} onChange={(v) => setRule('dayCounter', v)}>{t('settings.dayCounter')}</Chk>
          <Chk checked={r.downtime.book} onChange={(v) => setRule('downtime', { ...r.downtime, book: v })} sub={!r.downtime.book && <DowntimeOptions r={r} />}>{t('settings.downtime')}</Chk>
          <Chk checked={r.foreignTalentCost === 1} onChange={(v) => setRule('foreignTalentCost', v ? 1 : 2)}>{t('settings.foreignCost')}</Chk>
        </fieldset>

        <h3>{t('settings.skills')}</h3>
        <select aria-label={t('settings.skills')} value={r.skillStage} style={{ width: '100%' }} onChange={(e) => setRule('skillStage', e.target.value as TableRules['skillStage'])}>
          {STAGES.map((s) => <option key={s} value={s}>{t(`settings.stage.${s}`)}</option>)}
        </select>

        <h3>{t('settings.crew')}</h3>
        <label className="row" style={{ color: 'var(--ink)' }}>{t('settings.tier')} <input type="number" min={0} max={6} value={r.crewTier} style={{ width: 70 }} onChange={(e) => setRule('crewTier', num(e.target.value, 0, 6))} /></label>
        <div className="small">{t('settings.tierHint')}</div>

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

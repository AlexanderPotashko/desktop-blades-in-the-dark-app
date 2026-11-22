// Table-rules editor shared by Settings (the open sheet's rules) and the campaign screen (a campaign's rules).
// It only shows `r` and reports edits through `set`; where they are stored is the caller's business.
import type { ReactNode } from 'react';
import type { TableRules } from '../model';
import { t } from '../i18n';

const STAGES = ['creation', 'play', 'mastery', 'free'] as const;
const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(+v) || min));

export type SetRule = <K extends keyof TableRules>(key: K, value: TableRules[K]) => void;

function Chk({ checked, onChange, children, sub }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <label className="chk"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}</label>
      {sub}
    </>
  );
}

function DowntimeOptions({ r, set: setRule }: { r: TableRules; set: SetRule }) {
  const set = (options: TableRules['downtime']['options']) => setRule('downtime', { ...r.downtime, options });
  const patch = (i: number, p: Partial<TableRules['downtime']['options'][number]>) => set(r.downtime.options.map((o, j) => (j === i ? { ...o, ...p } : o)));
  const add = (name: string, healing: number, stressRelief: number) => set([...r.downtime.options, { id: crypto.randomUUID(), name, healing, stressRelief }]);
  return (
    <div className="sub2" style={{ display: 'grid' }} data-testid="downtime-options">
      {r.downtime.options.map((o, i) => (
        <div key={o.id} className="row">
          <input value={o.name} style={{ width: 200 }} aria-label={t('settings.optName')} onChange={(e) => patch(i, { name: e.target.value })} />
          {t('healing')} <input type="number" min={0} max={4} value={o.healing} style={{ width: 60 }} onChange={(e) => patch(i, { healing: num(e.target.value, 0, 4) })} />
          {t('stress')} &minus;<input type="number" min={0} max={20} value={o.stressRelief} style={{ width: 60 }} onChange={(e) => patch(i, { stressRelief: num(e.target.value, 0, 20) })} />
          <button className="mini" onClick={() => set(r.downtime.options.filter((_, j) => j !== i))} aria-label={t('remove')}>&#x2715;</button>
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

export function RulesEditor({ r, set, name = 'mode' }: { r: TableRules; set: SetRule; name?: string }) {
  const book = r.mode === 'book';
  return (
    <>
      <h3>{t('settings.rules')}</h3>
      <div className="row">
        {(['book', 'custom'] as const).map((m) => (
          <label key={m} className="chk"><input type="radio" name={name} value={m} checked={r.mode === m} onChange={() => set('mode', m)} /> {t(`settings.mode.${m}`)}</label>
        ))}
      </div>
      <div className="small">{t(book ? 'settings.modeInfo.book' : 'settings.modeInfo.custom')}</div>
      <fieldset className={`rules${book ? ' off' : ''}`} disabled={book}>
        <div className="small">{t('settings.checkHint')}</div>
        <Chk checked={r.money.book} onChange={(v) => set('money', { ...r.money, book: v })} sub={!r.money.book && (
          <div className="sub2">
            {t('settings.currency')} {t('settings.major')} <input value={r.money.major} style={{ width: 120 }} onChange={(e) => set('money', { ...r.money, major: e.target.value })} />
            {t('settings.minor')} <input value={r.money.minor} style={{ width: 130 }} onChange={(e) => set('money', { ...r.money, minor: e.target.value })} />
            {t('settings.rate')} <input type="number" min={1} value={r.money.rate} style={{ width: 70 }} onChange={(e) => set('money', { ...r.money, rate: num(e.target.value, 1, 1000) })} />
          </div>
        )}>{t('settings.money')}</Chk>
        <Chk checked={r.stress.book} onChange={(v) => set('stress', { ...r.stress, book: v })} sub={!r.stress.book && (
          <div className="sub2">{t('settings.stressBoxes')} <input type="number" min={1} max={20} value={r.stress.boxes} style={{ width: 70 }} onChange={(e) => set('stress', { ...r.stress, boxes: num(e.target.value, 1, 20) })} /></div>
        )}>{t('settings.stress')}</Chk>
        <div className="sub2">{t('settings.xpBoxes')} <input type="number" min={1} max={40} value={r.playbookXpBoxes} style={{ width: 70 }} onChange={(e) => set('playbookXpBoxes', num(e.target.value, 1, 40))} /> <span className="small">{t('settings.xpBoxesHint')}</span></div>
        <Chk checked={r.load} onChange={(v) => set('load', v)}>{t('settings.load')}</Chk>
        <Chk checked={r.specialArmor === 'shared'} onChange={(v) => set('specialArmor', v ? 'shared' : 'per-talent')}>{t('settings.specialArmor')}</Chk>
        <Chk checked={r.bandolier === 'book'} onChange={(v) => set('bandolier', v ? 'book' : 'own-items')}>{t('settings.bandolier')}</Chk>
        <Chk checked={r.presets === 'book'} onChange={(v) => set('presets', v ? 'book' : 'book+own')}>{t('settings.presets')}</Chk>
        <Chk checked={r.dayCounter} onChange={(v) => set('dayCounter', v)}>{t('settings.dayCounter')}</Chk>
        <Chk checked={r.downtime.book} onChange={(v) => set('downtime', { ...r.downtime, book: v })} sub={!r.downtime.book && <DowntimeOptions r={r} set={set} />}>{t('settings.downtime')}</Chk>
        <Chk checked={r.foreignTalentCost === 1} onChange={(v) => set('foreignTalentCost', v ? 1 : 2)}>{t('settings.foreignCost')}</Chk>
      </fieldset>

      <h3>{t('settings.skills')}</h3>
      <select aria-label={t('settings.skills')} value={r.skillStage} style={{ width: '100%' }} onChange={(e) => set('skillStage', e.target.value as TableRules['skillStage'])}>
        {STAGES.map((s) => <option key={s} value={s}>{t(`settings.stage.${s}`)}</option>)}
      </select>

      <h3>{t('settings.crew')}</h3>
      <label className="row" style={{ color: 'var(--ink)' }}>{t('settings.tier')} <input type="number" min={0} max={6} value={r.crewTier} style={{ width: 70 }} onChange={(e) => set('crewTier', num(e.target.value, 0, 6))} /></label>
      <div className="small">{t('settings.tierHint')}</div>
    </>
  );
}

import { talentCost } from '../../engine/xp';
import { t } from '../../i18n';
import { bookName, bookText, playbookList, talentDefs } from '../../store/content';
import { addCustomTalent, addTalent, removeCustomTalent, removeTalent, setCustomTalent } from '../../store/actions';
import { useRules, useStore } from '../../store/store';
import { tip } from '../widgets';

const CUSTOM = '__custom';

export function Talents() {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  const own = playbookList.find((p) => p.id === doc.playbookId);
  const free = (ids: string[]) => ids.filter((id) => !doc.talents.includes(id));
  const empty = !doc.talents.length && !doc.customTalents.length;
  return (
    <section>
      <h2 {...tip('tip.talents')}>{t('talents')}</h2>
      {doc.talents.map((id) => {
        const owner = talentDefs[id]?.owner;
        const foreign = owner && owner !== doc.playbookId;
        const cost = talentCost(id, doc.playbookId, talentDefs, rules);
        return (
          <div key={id} className="talent" data-talent={id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{bookName(id)}</b>
              <span className="row">
                {foreign && (
                  <span className="small">
                    {t('talents.foreign', { name: bookName(owner) })}
                    {cost > 1 && ` · ${t('talents.cost', { n: cost })}`}
                  </span>
                )}
                <button onClick={() => removeTalent(id)} title={t('remove')} aria-label={t('remove')}>✕</button>
              </span>
            </div>
            <p>{bookText(id)}</p>
          </div>
        );
      })}
      {doc.customTalents.map((c) => (
        <div key={c.id} className="talent" data-custom-talent={c.id}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input value={c.name} placeholder={t('talents.customName')} style={{ fontWeight: 'bold' }} onChange={(e) => setCustomTalent(c.id, { name: e.target.value })} />
            <span className="small">{t('talents.custom')}</span>
            <button onClick={() => removeCustomTalent(c.id)} title={t('remove')} aria-label={t('remove')}>✕</button>
          </div>
          <textarea value={c.text} placeholder={t('talents.customText')} style={{ minHeight: 60, marginTop: 4 }} onChange={(e) => setCustomTalent(c.id, { text: e.target.value })} />
          <label className="chk"><input type="checkbox" checked={c.specialArmor} onChange={(e) => setCustomTalent(c.id, { specialArmor: e.target.checked })} /> {t('talents.specialArmor')}</label>
        </div>
      ))}
      {empty && <div className="small" style={{ margin: '6px 0' }}>{t('talents.none')}</div>}
      <select
        aria-label={t('talents.add')}
        value=""
        style={{ width: '100%', marginTop: 8 }}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) addCustomTalent();
          else if (v) addTalent(v, rules);
        }}
      >
        <option value="">{t('talents.add')}</option>
        <option value={CUSTOM}>{t('talents.addCustom')}</option>
        {own && (
          <optgroup label={bookName(own.id)}>
            {free(own.talents.map((x) => x.id)).map((id) => <option key={id} value={id}>{bookName(id)}</option>)}
          </optgroup>
        )}
        {playbookList.filter((p) => p.id !== doc.playbookId).map((p) => (
          <optgroup key={p.id} label={t('talents.foreignGroup', { name: bookName(p.id) })}>
            {free(p.talents.map((x) => x.id)).map((id) => <option key={id} value={id}>{bookName(id)}</option>)}
          </optgroup>
        ))}
      </select>
    </section>
  );
}

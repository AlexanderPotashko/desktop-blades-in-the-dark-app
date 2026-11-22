import { attributes } from '../../engine/attributes';
import { stageCheck } from '../../engine/stage';
import { Attribute } from '../../model';
import { contentText, getLang, t } from '../../i18n';
import { actionDefs, bookName } from '../../store/content';
import { setAction, setXp } from '../../store/actions';
import { useRules, useStore } from '../../store/store';
import { Boxes, Dots, tip } from '../widgets';

const ATTRS = Attribute.options;

function StageInfo() {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  const c = stageCheck(doc.actions, rules.skillStage);
  if (rules.skillStage === 'free') return null;
  const over = c.over.map(bookName).join(', ');
  const cls = c.points > (c.maxPoints ?? Infinity) || c.over.length ? 'warn' : c.points === c.maxPoints ? 'good' : '';
  return (
    <div className="small" data-testid="stage-info">
      {c.maxPoints !== null ? (
        <>
          {t('skills.creation')} <b className={cls}>{c.points} / {c.maxPoints}</b> · {t('skills.maxN', { n: c.cap! })}
        </>
      ) : (
        t('skills.play', { n: c.cap! })
      )}
      {c.over.length > 0 && <> — <span className="warn">{t('skills.over', { list: over })}</span></>}
    </div>
  );
}

export function Skills() {
  const doc = useStore((s) => s.doc)!;
  const rules = useRules();
  const attrs = attributes(doc.actions, actionDefs);
  const n = rules.playbookXpBoxes;
  const trigger = contentText(getLang(), doc.playbookId)?.xpTrigger;
  return (
    <section>
      <h2 {...tip('tip.skills')}>{t('skills')}</h2>
      <StageInfo />
      {ATTRS.map((a) => (
        <div key={a} data-attr={a}>
          <h3>
            <span><span className="attr">{t(`attr.${a}`)}</span> <span className="attr" data-testid={`attr-${a}`}>{attrs[a]}</span></span>
            <span className="row xp" style={{ gap: 3 }}>
              <Boxes n={6} value={doc.xp[a]} onChange={(v) => setXp(a, v)} label={t('xp')} />
            </span>
          </h3>
          {actionDefs.filter((d) => d.attribute === a).map((d) => (
            <div key={d.id} className="act">
              <Dots value={doc.actions[d.id] ?? 0} onChange={(v) => setAction(d.id, v)} label={bookName(d.id)} />
              <span {...tip('tip.action', { text: contentText(getLang(), d.id)?.short ?? '' })}>{bookName(d.id)}</span>
            </div>
          ))}
        </div>
      ))}
      <h3 {...tip('tip.xp')}>
        <span>{t('xp.playbook')}</span>
      </h3>
      <div className="xprows">
        {Array.from({ length: Math.ceil(n / 8) }, (_, r) => (
          <div key={r} className="row" style={{ gap: 3 }}>
            <Boxes n={Math.min(8, n - r * 8)} value={Math.max(0, Math.min(8, doc.xp.playbook - r * 8))} label={t('xp.playbook')}
              onChange={(v) => setXp('playbook', r * 8 + v)} />
          </div>
        ))}
      </div>
      {trigger && <div className="small" style={{ marginTop: 6 }}>{trigger}</div>}
    </section>
  );
}

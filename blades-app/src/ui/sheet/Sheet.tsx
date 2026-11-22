import { t } from '../../i18n';
import { Counters, Protection, Rest } from './Counters';
import { Skills } from './Skills';
import { Talents } from './Talents';
import { Vitals } from './Vitals';
import { tip } from '../widgets';

/** "Бланк" tab: everything is driven by the open character's playbook content, nothing is Leech-specific. */
export function Sheet() {
  return (
    <main id="sheet">
      <Skills />
      <Talents />
      <section>
        <h2 {...tip('tip.counters')}>{t('counters')}</h2>
        <Rest />
        <Protection />
        <Counters />
      </section>
      <Vitals />
    </main>
  );
}

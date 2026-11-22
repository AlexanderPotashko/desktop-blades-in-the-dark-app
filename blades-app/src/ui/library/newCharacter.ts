// HOOK (phase 7): the library's "+ New character" button calls this. The creation wizard replaces the body,
// e.g. `useUi.getState().set({ tab: 'wizard' })`. Until then it makes a blank sheet of the first playbook.
import { playbookList } from '../../store/content';
import { createCharacter } from '../../store/session';
import { useUi } from '../../store/ui';

export async function startNewCharacter(): Promise<void> {
  await createCharacter(playbookList[0].id);
  useUi.getState().set({ tab: 'sheet' });
}

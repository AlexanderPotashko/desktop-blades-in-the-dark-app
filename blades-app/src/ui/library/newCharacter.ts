import { openWizard } from '../../wizard/state';

/** The library's "+ New character" opens the creation wizard (it has its own "skip" for a blank sheet). */
export async function startNewCharacter(): Promise<void> {
  openWizard();
}

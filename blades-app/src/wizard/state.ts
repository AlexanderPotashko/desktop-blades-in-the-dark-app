import { create } from 'zustand';

/** Whether the creation wizard overlay is shown (the entry point is a header button). */
const deep = typeof location === 'undefined' ? null : /^#wizard-?(\d*)$/.exec(location.hash); // deep link: #wizard-3 opens at step 4
export const startStep = deep ? Math.max(0, +deep[1] - 1 || 0) : 0;
export const useWizard = create<{ open: boolean }>()(() => ({ open: !!deep }));
export const openWizard = () => useWizard.setState({ open: true });
export const closeWizard = () => useWizard.setState({ open: false });

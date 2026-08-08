import { create } from 'zustand';

/**
 * The confirmation banner and the camera's two top doors are siblings, so a
 * tiny shared signal coordinates their handoff without putting transient UI
 * state into the capture machine.
 */
export const useResultNotice = create<{ visible: boolean }>(() => ({
  visible: false,
}));

export function setResultNoticeVisible(visible: boolean) {
  useResultNotice.setState({ visible });
}

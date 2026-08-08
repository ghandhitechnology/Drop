/**
 * The hand-off, from the sheet back to the camera.
 *
 * A search result and a photo end in exactly the same place, and they get
 * there through exactly the same door: `capture()`. The sheet stages its pick,
 * dismisses, and starts a run with no photo behind it; the pipeline collects
 * the pick on its way past and the whole avatar sequence plays on the camera
 * screen as if the shutter had fired. Same beats, same card, same confirm.
 *
 * An empty `photoUri` is what tells the rest of the app this run came from the
 * catalogue: there is no frame to freeze, and the confirmation records it as
 * `search` rather than `camera`.
 */

import { Dimensions } from 'react-native';

import { centerSquare } from '../capture/anchor';
import { useCaptureMachine } from '../capture/useCaptureMachine';
import { stageSearchPick, type SearchPick } from './pick';

/**
 * How long to let the sheet finish closing before Drop draws itself in.
 *
 * The sequence starts at the centre of the frame, and starting it under a
 * sheet that is still sliding away throws the first beat behind glass.
 */
export const HANDOFF_DELAY_MS = 260;

/**
 * Where Drop stands for a run with no photo.
 *
 * The camera stage measures itself and reports its own size, but that number
 * lives inside the capture screen. A search run has no barcode bounds to
 * honour anyway, so the centre square of the window is the same rectangle the
 * shutter would have chosen — the two differ only by the system bars, which is
 * a few pixels of where a character stands.
 */
function searchAnchor() {
  const { width, height } = Dimensions.get('window');
  return centerSquare({ width, height });
}

/**
 * Play the sequence for the chosen catalogue entries.
 *
 * Safe to call from a screen that is dismissing: the machine is global and the
 * camera stays mounted underneath the sheet the whole time. One pick plays the
 * single card; several arrive as a plate of stacked cards.
 */
export function runSearchPicks(picks: readonly SearchPick[]): void {
  if (picks.length === 0) return;
  for (const pick of picks) stageSearchPick(pick);

  const machine = useCaptureMachine.getState();
  // A held frame from an earlier run still owns the machine; letting it go is
  // what puts the camera back in a state that accepts a new capture.
  if (machine.state.name !== 'framing' && machine.state.name !== 'idle') {
    machine.retake();
  }
  machine.capture('', searchAnchor());
}

/** Fire the sequence once the sheet is out of the way. */
export function handOffAfterDismiss(picks: readonly SearchPick[]): void {
  setTimeout(() => runSearchPicks(picks), HANDOFF_DELAY_MS);
}

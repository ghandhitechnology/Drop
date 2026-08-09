/**
 * A photo that was already taken.
 *
 * Not everything worth counting is in front of you when you think of it — a
 * meal already eaten, a bottle on someone else's table, a screenshot of a
 * receipt. Picking one enters the machine through the same `capture()` the
 * shutter uses, so the frame freezes, the print folds down into its square and
 * the run proceeds identically. Nothing downstream is told where the photo
 * came from, and nothing downstream needs to be.
 *
 * One pass of the manipulator stands between the picker and the machine, and it
 * is about the wire rather than the picture: it resamples to
 * `MAX_LONGEST_SIDE` when there is anything to resample, and always re-encodes
 * to JPEG. The format matters as much as the size — `mimeFor` in the transport
 * calls everything that is not a `.png` a JPEG, which is a true statement only
 * once the HEIC an iPhone hands over has been made into one.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useCallback, useRef } from 'react';

import { anchorFor, type StageSize } from './anchor';
import { downscalePlan, DOWNSCALE_QUALITY } from './library';
import { acceptsCapture } from './types';
import { useCaptureMachine } from './useCaptureMachine';

/**
 * Show the photo library and return a file that is fit to send.
 *
 * Resolves `null` when the person backs out, which is the common case and not
 * an error. A manipulator that fails resolves to the original file instead:
 * that is the honest fallback, because an oversized frame is refused by
 * `encodePhoto` and lands the run in `unresolved`, which is a designed state
 * with the catalogue behind it — whereas swallowing the pick would leave a tap
 * that visibly did nothing.
 */
export async function pickDownscaledPhoto(): Promise<string | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    // No crop step. The reticle already says which part of a frame Drop reads,
    // and a second framing UI in front of it would be asking twice.
    allowsEditing: false,
    exif: false,
    // The manipulator below owns the compression; asking the picker for it too
    // would re-encode the same pixels twice and lose a little each time.
    quality: 1,
  });

  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset?.uri) return null;

  try {
    const plan = downscalePlan(asset.width, asset.height);
    const context = ImageManipulator.manipulate(asset.uri);
    const image = await (plan ? context.resize(plan) : context).renderAsync();
    const saved = await image.saveAsync({
      compress: DOWNSCALE_QUALITY,
      format: SaveFormat.JPEG,
    });
    return saved.uri;
  } catch (error) {
    console.log('[capture] library resample', error);
    return asset.uri;
  }
}

/**
 * Choosing a photo instead of taking one.
 *
 * Shaped like `useTakePhoto`, and for the same reasons: the anchor is measured
 * at press time so the result grows out of the square that was on screen when
 * the person asked, and a ref guard means a double tap opens one picker.
 *
 * The guard is checked twice. A picker owns the screen for as long as it takes
 * to choose, which is long enough for a previous run to finish, for a retake,
 * or for the app to have been backgrounded and come back somewhere else.
 *
 * Unlike the shutter, this does not close the reticle on the way out. The
 * shutter closes it because the camera takes a visible moment to write a file
 * and the fold is what says the press landed; here the picker is already
 * covering the frame, so a fold behind it would be a movement nobody sees.
 * Worse, `CameraStage` holds the reticle it had at that moment — which may be a
 * barcode's bounds — while the anchor handed over below is the centre square,
 * and the corners would come to rest somewhere the print was never going to be.
 * Left alone, the reticle is still tracking the live frame when the photo
 * lands, resolves to the same centre square the anchor names, and folds into
 * the print in one visible movement.
 */
export function useLibraryPick(stage: StageSize) {
  const capture = useCaptureMachine((s) => s.capture);
  const clearBarcode = useCaptureMachine((s) => s.clearBarcode);
  const busy = useRef(false);

  return useCallback(async () => {
    if (busy.current) return;
    if (!acceptsCapture(useCaptureMachine.getState().state)) return;

    const anchor = anchorFor(stage);

    busy.current = true;
    try {
      const uri = await pickDownscaledPhoto();
      if (!uri) return;
      if (!acceptsCapture(useCaptureMachine.getState().state)) return;

      // A code can drift into the live frame while the picker covers it, and
      // `capture()` reads the hint off the machine and lets the barcode branch
      // outrank the picture. Whatever is on the counter behind the phone has
      // nothing to do with the photo being chosen, so the hint goes first —
      // same tick, nothing between the two calls.
      clearBarcode();
      capture(uri, anchor);
    } catch (error) {
      console.log('[capture] library', error);
    } finally {
      busy.current = false;
    }
  }, [stage, capture, clearBarcode]);
}

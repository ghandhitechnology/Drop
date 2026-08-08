/**
 * Every vibration Drop makes, named by what it means.
 *
 * Five moments earn one, and no others. The product is a camera pointed at the
 * world; a phone that thumps at every press stops meaning anything by the
 * second minute. So the vocabulary is deliberately small, and the one entry
 * that *does* fire everywhere is the quietest thing the platform offers:
 *
 *   press       — a control took the finger. The selection tick, the lightest
 *                 note available, fired on the way down from `ui/Touch` so the
 *                 whole product answers a touch the instant it lands. It sits
 *                 below the other four rather than beside them: this is the
 *                 texture of a control, not an event worth announcing.
 *   shutter     — the frame is taken. A light tap: the same weight a physical
 *                 shutter has, under the finger that pressed it.
 *   recognition — Drop has a name for the thing. Selection, because something
 *                 landed on a choice.
 *   confirmed   — it is in the history. Success, the one celebratory note.
 *   removing    — a row is on its way out. Warning, because it is the only
 *                 destructive gesture in the product and the swipe that starts
 *                 it can be made without looking.
 *
 * Every call is fire-and-forget. A device with no haptic motor, or a person who
 * has switched touch feedback off, resolves the rejection and carries on — the
 * feedback is a garnish on a state change that already happened visually and in
 * the screen reader.
 */
import * as Haptics from 'expo-haptics';

const ignore = () => {};

/** A control took the finger. The house press, fired by `ui/Touch`. */
export function tapPress(): void {
  Haptics.selectionAsync().catch(ignore);
}

/** The shutter, pressed. */
export function tapShutter(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore);
}

/** Recognition landed on a name, or a person moved between choices. */
export function tapSelection(): void {
  Haptics.selectionAsync().catch(ignore);
}

/** An entry reached the history. */
export function tapConfirmed(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore);
}

/** An entry is being taken back out. */
export function tapRemoving(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(ignore);
}

/** The whole vocabulary, for anything that wants to enumerate it. */
export const haptics = {
  press: tapPress,
  shutter: tapShutter,
  recognition: tapSelection,
  selection: tapSelection,
  confirmed: tapConfirmed,
  removing: tapRemoving,
} as const;

/** A name in the vocabulary above. */
export type HapticName = keyof typeof haptics;

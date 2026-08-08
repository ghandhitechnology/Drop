/**
 * Every vibration Drop makes, named by what it means.
 *
 * Seven moments earn one, and no others. The product is a camera pointed at the
 * world; a phone that thumps at every press stops meaning anything by the
 * second minute. So the vocabulary is deliberately small, and the one entry
 * that *does* fire everywhere is the quietest thing the platform offers:
 *
 *   press       — a control took the finger. The selection tick, the lightest
 *                 note available, fired on the way down from `ui/Touch` so the
 *                 whole product answers a touch the instant it lands. It sits
 *                 below the other six rather than beside them: this is the
 *                 texture of a control, not an event worth announcing.
 *   shutter     — the frame is taken. A light tap: the same weight a physical
 *                 shutter has, under the finger that pressed it.
 *   stamp       — the print hits the paper. The heaviest note in the product,
 *                 and the only one that is: this is the single moment where
 *                 something in Drop is meant to feel like an object with mass
 *                 landing on a surface, and it is the beat the whole capture
 *                 has been travelling toward. It answers `shutter` — the light
 *                 click of pressing, then the thump of the thing arriving.
 *   pull        — the card comes open. Belongs to the action rather than to any
 *                 one control, because there are five ways to ask for it: the
 *                 chevron, a tap anywhere on Drop, the backdrop, a drag and a
 *                 flick. The result opening should feel the same whichever was
 *                 used. Medium — heavier than taking a photo, lighter than the
 *                 print landing.
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

/**
 * The print landed on the paper.
 *
 * Heavy, deliberately. Every other note in the product is a light
 * acknowledgement; this one is a physical event, and the print visibly
 * compresses into the page at the same instant. A lighter style reads as one
 * more confirmation tick and the stamp stops landing.
 */
export function tapStamp(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(ignore);
}

/**
 * The result opened.
 *
 * Fired from the open itself, not from the control that asked for it, so the
 * chevron, a tap on Drop, the backdrop and a dragged card all land the same
 * note — including the ones that are gestures rather than buttons and have no
 * press tick of their own. Controls that route here pass `haptic="none"` to
 * `ui/Touch` so the house tick does not stack on top of it.
 */
export function tapPull(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(ignore);
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
  stamp: tapStamp,
  pull: tapPull,
  recognition: tapSelection,
  selection: tapSelection,
  confirmed: tapConfirmed,
  removing: tapRemoving,
} as const;

/** A name in the vocabulary above. */
export type HapticName = keyof typeof haptics;

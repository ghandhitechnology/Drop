/**
 * The pose vocabulary Drop draws from.
 *
 * The full sheet lives in assets/character (32 poses). Only the poses the
 * product actually speaks with are required here, so the bundle carries nine
 * small PNGs rather than the whole sheet.
 *
 * Every pose is pure black line art on transparent alpha — the ink colour is
 * applied at draw time from the theme, so one asset serves both schemes.
 */

export const POSE_SOURCES = {
  /** pose_01 — idle_front. The resting face of the product. */
  idle_front: require('../../assets/character/pose_01.png'),
  /** pose_25 — thinking_chin. Hand to chin, weight on one foot. */
  thinking_chin: require('../../assets/character/pose_25.png'),
  /** pose_31 — dizzy. Spiral eyes, arms out; reads as "working on it". */
  dizzy: require('../../assets/character/pose_31.png'),
  /** pose_08 — point_right. Presents the number sitting beside it. */
  point_right: require('../../assets/character/pose_08.png'),
  /** pose_14 — cheer_arms_up. The alternate presenting pose. */
  cheer_arms_up: require('../../assets/character/pose_14.png'),
  /** pose_32 — cheer_sparkle. The celebration peak. */
  cheer_sparkle: require('../../assets/character/pose_32.png'),
  /** pose_24 — celebrate_wave. Where a celebration settles. */
  celebrate_wave: require('../../assets/character/pose_24.png'),
  /** pose_26 — surprised_gasp. Something new turned up. */
  surprised_gasp: require('../../assets/character/pose_26.png'),
  /** pose_23 — sleeping. History rows, idle-for-a-while. */
  sleeping: require('../../assets/character/pose_23.png'),
} as const;

export type PoseId = keyof typeof POSE_SOURCES;

export const POSE_IDS = Object.keys(POSE_SOURCES) as PoseId[];

/** The states the rest of the app talks to Drop in. */
export type CharacterState =
  | 'idle'
  | 'thinking'
  | 'analyzing'
  | 'presenting'
  | 'celebrating'
  | 'unresolved'
  | 'resting';

export const CHARACTER_STATES: CharacterState[] = [
  'idle',
  'thinking',
  'analyzing',
  'presenting',
  'celebrating',
  'unresolved',
  'resting',
];

/**
 * How long the celebration peak holds before Drop settles into a wave.
 * Matches the spark burst so the two land together.
 */
export const CELEBRATION_PEAK_MS = 500;

/**
 * State → pose.
 *
 * Two states have a second beat: `presenting` picks between two poses from the
 * seed so a screenful of Drops is not a row of identical points, and
 * `celebrating` peaks then settles.
 */
export function poseFor(
  state: CharacterState,
  seed: number,
  settled: boolean,
): PoseId {
  switch (state) {
    case 'idle':
      return 'idle_front';
    case 'thinking':
      return 'thinking_chin';
    case 'analyzing':
      return 'dizzy';
    case 'presenting':
      return presentingVariant(seed);
    case 'celebrating':
      return settled ? 'celebrate_wave' : 'cheer_sparkle';
    case 'unresolved':
      return 'surprised_gasp';
    case 'resting':
      return 'sleeping';
  }
}

/**
 * The point is the everyday presenting pose; arms-up shows up about a third of
 * the time, chosen from the seed so a given item always presents the same way.
 */
export function presentingVariant(seed: number): PoseId {
  // Bit 11 of the seed — cheap, stable, and evenly split enough for this.
  return ((seed >>> 11) & 0b111) > 4 ? 'cheer_arms_up' : 'point_right';
}

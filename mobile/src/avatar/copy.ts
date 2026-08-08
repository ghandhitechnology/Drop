/**
 * Every word the avatar says to a screen reader.
 *
 * These belong in the app-wide copy module (src/lib/copy.ts) once it exists —
 * re-export `avatarCopy` from there and keep this file as the single place the
 * strings are authored.
 */

import type { CharacterState } from './poses';

export const avatarCopy = {
  /** Spoken label per state. Also what gets announced on a state change. */
  state: {
    idle: 'Drop is here',
    thinking: 'Drop is thinking',
    analyzing: 'Drop is working out the water',
    presenting: 'Drop has your result',
    celebrating: 'Drop is celebrating',
    unresolved: 'Drop found something new',
    resting: 'Drop is resting',
  } satisfies Record<CharacterState, string>,

  /** Added as a hint when the avatar is tappable. */
  openHint: 'Opens the details',
} as const;

export function avatarLabel(state: CharacterState): string {
  return avatarCopy.state[state];
}

import { create } from 'zustand';

import type { ColorTheme } from './tokens';

export type SchemePreference = 'system' | 'light' | 'dark';
export type MotionPreference = 'system' | 'full' | 'reduced';

export type PreferencesState = {
  /** The visual family used in both light and dark mode. */
  theme: ColorTheme;
  /** Theme choice. 'system' follows the OS appearance setting. */
  scheme: SchemePreference;
  /** Motion choice. 'system' follows the OS reduce-motion setting. */
  motion: MotionPreference;
  /**
   * Paper grain. On by default — it is the ground the whole product is drawn
   * on. Off leaves a flat surface for anyone who reads better without it.
   */
  texture: boolean;
  /**
   * Legibility mode. Swaps the handwriting for the platform's own font at a
   * heavier weight, which is the most legible face guaranteed to be present.
   */
  legibleText: boolean;
  setTheme: (theme: ColorTheme) => void;
  setScheme: (scheme: SchemePreference) => void;
  setMotion: (motion: MotionPreference) => void;
  setTexture: (texture: boolean) => void;
  setLegibleText: (legibleText: boolean) => void;
};

/**
 * In-app overrides for the settings a person may want to differ from their
 * platform defaults. Each one defaults to the way the product is authored;
 * the app only diverges when someone asks it to.
 *
 * The store itself is pure and synchronous so any component may read it during
 * render. Durability lives beside the settings screen
 * (`features/settings/persist.ts`), which mirrors these preferences into the
 * key-value table and hydrates them once at boot.
 */
export const usePreferences = create<PreferencesState>((set) => ({
  theme: 'default',
  scheme: 'system',
  motion: 'system',
  texture: true,
  legibleText: false,
  setTheme: (theme) => set({ theme }),
  setScheme: (scheme) => set({ scheme }),
  setMotion: (motion) => set({ motion }),
  setTexture: (texture) => set({ texture }),
  setLegibleText: (legibleText) => set({ legibleText }),
}));

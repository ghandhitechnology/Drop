/**
 * Colours for marks that sit directly on the camera preview.
 *
 * Default keeps the original white viewfinder ink. The two authored color
 * themes carry their identity onto the glass: Salty ocean draws in brown and
 * Absolutely in Claude's red-brown. Each colored mark gets a theme-matched
 * halo or wash so it remains legible as the live image changes underneath it.
 */
import { usePreferences } from '../../design/preferences';
import { useTheme } from '../../design/theme';

export type OverlayInk = {
  mark: string;
  markSoft: string;
  scrim: string;
  tint: string;
  outline: string;
  halo: string;
  band: string;
  shutterFill: string;
};

const DEFAULT_INK: OverlayInk = {
  mark: '#FFFFFF',
  markSoft: 'rgba(255,255,255,0.76)',
  scrim: 'rgba(0,0,0,0.46)',
  tint: 'rgba(24,20,12,0.42)',
  outline: 'rgba(255,255,255,0.88)',
  halo: 'rgba(0,0,0,0.55)',
  band: 'rgba(0,0,0,0.34)',
  shutterFill: '#FFFFFF',
};

const SALTY_INK: Record<'light' | 'dark', OverlayInk> = {
  light: {
    mark: '#52372D',
    markSoft: 'rgba(82,55,45,0.76)',
    scrim: 'rgba(203,231,242,0.68)',
    tint: 'rgba(203,231,242,0.58)',
    outline: 'rgba(82,55,45,0.88)',
    halo: 'rgba(203,231,242,0.78)',
    band: 'rgba(18,51,78,0.30)',
    shutterFill: '#CBE7F2',
  },
  dark: {
    mark: '#E8C9AC',
    markSoft: 'rgba(232,201,172,0.76)',
    scrim: 'rgba(18,51,78,0.72)',
    tint: 'rgba(26,66,93,0.64)',
    outline: 'rgba(232,201,172,0.88)',
    halo: 'rgba(18,51,78,0.78)',
    band: 'rgba(0,0,0,0.38)',
    shutterFill: '#12334E',
  },
};

const ABSOLUTELY_INK: Record<'light' | 'dark', OverlayInk> = {
  light: {
    mark: '#9C452C',
    markSoft: 'rgba(156,69,44,0.76)',
    scrim: 'rgba(250,249,245,0.72)',
    tint: 'rgba(250,249,245,0.62)',
    outline: 'rgba(156,69,44,0.88)',
    halo: 'rgba(250,249,245,0.80)',
    band: 'rgba(20,20,19,0.30)',
    shutterFill: '#FAF9F5',
  },
  dark: {
    mark: '#E58C6B',
    markSoft: 'rgba(229,140,107,0.78)',
    scrim: 'rgba(20,20,19,0.72)',
    tint: 'rgba(38,38,36,0.66)',
    outline: 'rgba(229,140,107,0.88)',
    halo: 'rgba(20,20,19,0.80)',
    band: 'rgba(0,0,0,0.40)',
    shutterFill: '#262624',
  },
};

export function useOverlayInk(): OverlayInk {
  const colorTheme = usePreferences((state) => state.theme);
  const { scheme } = useTheme();

  if (colorTheme === 'saltyOcean1') return SALTY_INK[scheme];
  if (colorTheme === 'absolutely') return ABSOLUTELY_INK[scheme];
  return DEFAULT_INK;
}

/** How far the reticle closes on the shutter alone. */
export const RETICLE_HANDOFF = 0.55;

/** Share of the print's arrival the corners are still drawn over it for. */
export const RETICLE_RELEASE = 0.42;

/** How far the preview is dimmed once a result is on screen. */
export const RESULT_DIM = 0.62;

/** Blur radius applied to the frozen frame once a result is on screen. */
export const RESULT_BLUR = 16;

/** Recognition only needs the held frame as context. */
export const PROCESSING_DIM = 0.88;

/** Blur used while the service is reading the captured frame. */
export const PROCESSING_BLUR = 28;

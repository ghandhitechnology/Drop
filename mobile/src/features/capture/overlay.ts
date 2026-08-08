/**
 * Colours for marks that sit directly on the camera preview.
 *
 * These deliberately sit outside the theme tokens. Tokens describe ink on
 * paper; a viewfinder is neither, and its brightness changes with whatever the
 * lens is pointed at. Controls over live video are therefore always white,
 * always carried on their own dark scrim, so contrast holds in a bright shop
 * aisle and in a dim kitchen alike.
 */
export const overlayInk = {
  /** Marks and text on the preview. */
  mark: '#FFFFFF',
  /** Secondary marks — still white, carried at lower weight. */
  markSoft: 'rgba(255,255,255,0.76)',
  /** The scrim every piece of overlay text sits on. */
  scrim: 'rgba(0,0,0,0.46)',
  /**
   * The wash inside a drawn chip. Warm rather than neutral — it is paper held
   * up against the light, not a black box laid over it — and translucent enough
   * that the frame keeps reading through the control sitting on it.
   */
  tint: 'rgba(24,20,12,0.42)',
  /** The pencil line around a drawn chip. */
  outline: 'rgba(255,255,255,0.88)',
  /**
   * Carried under loose marks and annotation text that have no chip beneath
   * them, so a white line stays readable against a white wall.
   */
  halo: 'rgba(0,0,0,0.55)',
  /** A heavier scrim for the top and bottom bands. */
  band: 'rgba(0,0,0,0.34)',
  /** Fill behind the shutter's inner disc. */
  shutterFill: '#FFFFFF',
} as const;

/** How far the preview is dimmed once a result is on screen. */
export const RESULT_DIM = 0.62;

/** Blur radius applied to the frozen frame once a result is on screen. */
export const RESULT_BLUR = 16;

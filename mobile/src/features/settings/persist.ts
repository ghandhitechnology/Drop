/**
 * Preferences, remembered.
 *
 * The preference store itself stays pure and synchronous so any component can
 * read it during render. Durability lives here instead: one read at boot, and
 * one write whenever a value actually changes.
 *
 * Writes are driven from a store subscription rather than from the settings
 * screen's press handlers. A preference changed from anywhere — a future
 * shortcut, a deep link, a test — is then persisted by construction, and there
 * is no path that changes the app's appearance without recording it.
 */
import { kvGet, kvSet } from '../../data/db';
import {
  usePreferences,
  type MotionPreference,
  type PreferencesState,
  type SchemePreference,
} from '../../design/preferences';

const KEY = 'preferences.v1';

/** The durable shape. Only the values — the setters are not data. */
type StoredPreferences = Pick<
  PreferencesState,
  'scheme' | 'motion' | 'texture' | 'legibleText'
>;

const SCHEMES: SchemePreference[] = ['system', 'light', 'dark'];
const MOTIONS: MotionPreference[] = ['system', 'full', 'reduced'];

/**
 * Reads a stored blob back into a valid state.
 *
 * Every field is validated against the values the app understands. A blob
 * written by a future version, or a half-written one, falls back field by field
 * to the authored default rather than putting an unknown string into the theme.
 */
export function parsePreferences(raw: string | null): Partial<StoredPreferences> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const source = parsed as Record<string, unknown>;
  const out: Partial<StoredPreferences> = {};

  if (SCHEMES.includes(source.scheme as SchemePreference)) {
    out.scheme = source.scheme as SchemePreference;
  }
  if (MOTIONS.includes(source.motion as MotionPreference)) {
    out.motion = source.motion as MotionPreference;
  }
  if (typeof source.texture === 'boolean') out.texture = source.texture;
  if (typeof source.legibleText === 'boolean') out.legibleText = source.legibleText;

  return out;
}

function snapshot(state: PreferencesState): StoredPreferences {
  return {
    scheme: state.scheme,
    motion: state.motion,
    texture: state.texture,
    legibleText: state.legibleText,
  };
}

function same(a: StoredPreferences, b: StoredPreferences): boolean {
  return (
    a.scheme === b.scheme &&
    a.motion === b.motion &&
    a.texture === b.texture &&
    a.legibleText === b.legibleText
  );
}

let started = false;

/**
 * Hydrate once, then mirror every change.
 *
 * Called from the camera route at boot. It is deliberately not awaited: the
 * app renders on its authored defaults for the frame or two the read takes,
 * and the stored values land right behind them. Blocking the first frame on a
 * database read to avoid a single frame of the wrong theme is the wrong trade
 * on a camera-first product.
 */
export async function startPreferencePersistence(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const stored = parsePreferences(await kvGet(KEY));
    if (Object.keys(stored).length > 0) {
      usePreferences.setState(stored);
    }
  } catch {
    // Authored defaults are a perfectly good place to be.
  }

  let last = snapshot(usePreferences.getState());
  usePreferences.subscribe((state) => {
    const next = snapshot(state);
    if (same(last, next)) return;
    last = next;
    kvSet(KEY, JSON.stringify(next)).catch(() => {});
  });
}

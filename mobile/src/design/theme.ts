import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  themePalettes,
  radius,
  space,
  type ColorScheme,
  type ColorTokens,
} from './tokens';
import { usePreferences, type SchemePreference } from './preferences';

export type { ColorScheme } from './tokens';

export type Theme = {
  /** The scheme actually in effect, after applying any manual override. */
  scheme: ColorScheme;
  colors: ColorTokens;
  space: typeof space;
  radius: typeof radius;
};

const ThemeContext = createContext<Theme | null>(null);

function resolveScheme(
  preference: SchemePreference,
  system: ColorScheme,
): ColorScheme {
  return preference === 'system' ? system : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colorTheme = usePreferences((s) => s.theme);
  const preference = usePreferences((s) => s.scheme);
  const scheme = resolveScheme(preference, systemScheme);

  const theme = useMemo<Theme>(
    () => ({ scheme, colors: themePalettes[colorTheme][scheme], space, radius }),
    [colorTheme, scheme],
  );

  return createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return theme;
}

/** Convenience accessor for the colour tokens alone. */
export function useColors(): ColorTokens {
  return useTheme().colors;
}

/**
 * Read and change the theme preference. Separated from `useTheme` so that
 * components which only render do not re-subscribe to the setter.
 */
export function useSchemePreference() {
  const preference = usePreferences((s) => s.scheme);
  const setScheme = usePreferences((s) => s.setScheme);
  return { preference, setScheme };
}

/** Read and change the visual family independently from light/dark mode. */
export function useColorThemePreference() {
  const preference = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  return { preference, setTheme };
}

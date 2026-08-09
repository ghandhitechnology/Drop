/**
 * Theme family previews and light/dark mode controls.
 *
 * The family and mode are independent: a person can choose the visual voice
 * they like, then let the phone decide whether its light or dark palette is in
 * effect. Each preview uses the effective scheme, so the choice is an honest
 * miniature of what pressing it will produce right now.
 */
import { StyleSheet, View } from 'react-native';

import {
  useColorThemePreference,
  useSchemePreference,
  useTheme,
} from '../../design/theme';
import {
  MIN_TOUCH_SIZE,
  radius,
  space,
  themePalettes,
  type ColorTheme,
} from '../../design/tokens';
import type { SchemePreference } from '../../design/preferences';
import { copy } from '../../lib/copy';
import { tapSelection } from '../../lib/haptics';
import { SketchButton } from '../../ui/SketchButton';
import { Text } from '../../ui/Text';

const THEME_OPTIONS: { value: ColorTheme; label: string }[] = [
  { value: 'default', label: copy.settings.appearance.default },
  { value: 'saltyOcean1', label: copy.settings.appearance.saltyOcean1 },
  { value: 'absolutely', label: copy.settings.appearance.absolutely },
];

const MODE_OPTIONS: { value: SchemePreference; label: string }[] = [
  { value: 'system', label: copy.settings.appearance.system },
  { value: 'light', label: copy.settings.appearance.light },
  { value: 'dark', label: copy.settings.appearance.dark },
];

export type ThemeChoiceProps = {
  /** Announced after a change, so the new state is spoken rather than inferred. */
  onChange?: (label: string) => void;
};

export function ThemeChoice({ onChange }: ThemeChoiceProps) {
  const { scheme } = useTheme();
  const { preference: theme, setTheme } = useColorThemePreference();
  const { preference: mode, setScheme } = useSchemePreference();

  const chooseTheme = (value: ColorTheme, label: string) => {
    if (theme === value) return;
    tapSelection();
    setTheme(value);
    onChange?.(label);
  };

  const chooseMode = (value: SchemePreference, label: string) => {
    if (mode === value) return;
    tapSelection();
    setScheme(value);
    onChange?.(label);
  };

  return (
    <View style={styles.groups}>
      <View>
        <Text variant="chip" tone="inkSoft" style={styles.groupLabel}>
          {copy.settings.appearance.theme}
        </Text>
        <View
          style={styles.themeRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={copy.settings.appearance.theme}
        >
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.value;
            const preview = themePalettes[option.value][scheme];

            return (
              <SketchButton
                key={option.value}
                onPress={() => chooseTheme(option.value, option.label)}
                seed={`settings/theme/${option.value}`}
                tone={selected ? 'accent' : 'quiet'}
                filled={selected}
                radius={radius.md}
                scale={selected ? 0.9 : 0.7}
                style={styles.themeCell}
                contentStyle={styles.themeContent}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityHint={copy.settings.appearance.themeHint}
                accessibilityState={{ selected }}
              >
                <View
                  style={[
                    styles.preview,
                    {
                      backgroundColor: preview.bg,
                      borderColor: preview.inkFaint,
                    },
                  ]}
                  pointerEvents="none"
                >
                  <View
                    style={[
                      styles.previewPaper,
                      { backgroundColor: preview.paper },
                    ]}
                  >
                    <View
                      style={[
                        styles.previewTitle,
                        { backgroundColor: preview.ink },
                      ]}
                    />
                    <View
                      style={[
                        styles.previewLine,
                        { backgroundColor: preview.inkSoft },
                      ]}
                    />
                    <View
                      style={[
                        styles.previewLineShort,
                        { backgroundColor: preview.inkSoft },
                      ]}
                    />
                    <View
                      style={[
                        styles.previewAccent,
                        { backgroundColor: preview.accent },
                      ]}
                    />
                  </View>
                </View>
                <Text
                  variant="chip"
                  tone={selected ? 'accent' : 'inkSoft'}
                  style={styles.themeLabel}
                  numberOfLines={2}
                >
                  {option.label}
                </Text>
              </SketchButton>
            );
          })}
        </View>
      </View>

      <View>
        <Text variant="chip" tone="inkSoft" style={styles.groupLabel}>
          {copy.settings.appearance.mode}
        </Text>
        <View
          style={styles.modeRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={copy.settings.appearance.mode}
        >
          {MODE_OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <SketchButton
                key={option.value}
                onPress={() => chooseMode(option.value, option.label)}
                seed={`settings/mode/${option.value}`}
                tone={selected ? 'accent' : 'quiet'}
                filled={selected}
                radius={radius.lg}
                scale={selected ? 0.9 : 0.7}
                style={styles.modeCell}
                contentStyle={styles.modeContent}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityHint={copy.settings.appearance.modeHint}
                accessibilityState={{ selected }}
              >
                <Text variant="label" tone={selected ? 'accent' : 'inkSoft'}>
                  {option.label}
                </Text>
              </SketchButton>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const MODE_HEIGHT = MIN_TOUCH_SIZE;

const styles = StyleSheet.create({
  groups: { gap: space.xl },
  groupLabel: { marginBottom: space.sm },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  themeCell: { width: '48%', minHeight: 116 },
  themeContent: {
    minHeight: 116,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    padding: space.sm,
  },
  preview: {
    height: 66,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 6,
    overflow: 'hidden',
  },
  previewPaper: {
    flex: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  previewTitle: { width: '42%', height: 5, borderRadius: radius.pill },
  previewLine: {
    width: '76%',
    height: 3,
    marginTop: 7,
    borderRadius: radius.pill,
  },
  previewLineShort: {
    width: '55%',
    height: 3,
    marginTop: 4,
    borderRadius: radius.pill,
  },
  previewAccent: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    position: 'absolute',
    right: 6,
    bottom: 5,
  },
  themeLabel: {
    minHeight: 32,
    marginTop: space.xs,
    textAlign: 'center',
  },
  modeRow: { flexDirection: 'row', gap: space.sm },
  modeCell: { flex: 1, height: MODE_HEIGHT },
  modeContent: {
    height: MODE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

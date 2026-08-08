/**
 * Three drawn chips: system, light, dark.
 *
 * A radio group rather than a switch, because the third option is the one most
 * people should stay on and a two-state control has no room to say "whatever
 * the phone is doing". The choice applies the moment it is pressed — there is
 * nothing to save, and a settings screen with a save button is a settings
 * screen that can be left in a state the person did not intend.
 *
 * The selected chip is filled and outlined in accent, and it is the only chip
 * whose label is accent. Shape and weight both carry the selection, so it reads
 * without colour.
 */
import { StyleSheet, View } from 'react-native';

import { useSchemePreference } from '../../design/theme';
import { useColors } from '../../design/theme';
import { MIN_TOUCH_SIZE, radius, space } from '../../design/tokens';
import type { SchemePreference } from '../../design/preferences';
import { HandFrame } from '../../drawing/HandFrame';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { tapSelection } from '../../lib/haptics';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';

const OPTIONS: { value: SchemePreference; label: string }[] = [
  { value: 'system', label: copy.settings.appearance.system },
  { value: 'light', label: copy.settings.appearance.light },
  { value: 'dark', label: copy.settings.appearance.dark },
];

export type ThemeChoiceProps = {
  /** Announced after a change, so the new state is spoken rather than inferred. */
  onChange?: (label: string) => void;
};

export function ThemeChoice({ onChange }: ThemeChoiceProps) {
  const colors = useColors();
  const { preference, setScheme } = useSchemePreference();

  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.settings.appearance.theme}
    >
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <Touch
            key={option.value}
            onPress={() => {
              if (selected) return;
              tapSelection();
              setScheme(option.value);
              onChange?.(option.label);
            }}
            style={styles.cell}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={copy.settings.appearance.themeHint}
            accessibilityState={{ selected }}
          >
            <HandFrame
              seed={seedFromString(`settings/theme/${option.value}`)}
              variant={selected ? 'crayon' : 'pencil'}
              color={selected ? colors.accent : colors.inkFaint}
              radius={radius.lg}
              style={[
                styles.chip,
                { backgroundColor: selected ? colors.accentSoft : 'transparent' },
              ]}
              contentStyle={styles.chipContent}
            >
              <Text variant="label" tone={selected ? 'accent' : 'inkSoft'}>
                {option.label}
              </Text>
            </HandFrame>
          </Touch>
        );
      })}
    </View>
  );
}

/** Drawn at the platform minimum, so no chip depends on hitSlop to be hittable. */
const CHIP_HEIGHT = MIN_TOUCH_SIZE;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 1 },
  chip: { height: CHIP_HEIGHT, borderRadius: radius.lg, overflow: 'hidden' },
  chipContent: {
    height: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

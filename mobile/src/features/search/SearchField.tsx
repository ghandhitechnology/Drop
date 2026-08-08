/**
 * The one input in Drop.
 *
 * It takes focus the moment the sheet lands, because someone who opened a
 * search screen has already decided to type. Everything else here is about
 * staying out of the way: a drawn frame rather than a chrome box, no submit
 * button (results are already changing under the caret), and a clear mark that
 * appears only once there is something to clear.
 */

import { forwardRef, useCallback } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from 'react-native';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { HandFrame } from '../../drawing/HandFrame';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
};

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChange, onSubmit, autoFocus = true },
  ref,
) {
  const { colors } = useTheme();

  const handleSubmit = useCallback(
    (_event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => onSubmit?.(),
    [onSubmit],
  );

  return (
    <HandFrame
      seed={seedFromString('search/field')}
      color={colors.inkFaint}
      radius={16}
      strokeScale={0.9}
      style={styles.frame}
      contentStyle={styles.content}
    >
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={handleSubmit}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        placeholder={copy.search.placeholder}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={copy.search.fieldLabel}
        selectionColor={colors.accent}
        style={[styles.input, { color: colors.ink }]}
      />

      {value.length > 0 && (
        <Touch
          onPress={() => onChange('')}
          style={styles.clear}
          accessibilityLabel={copy.search.clear}
        >
          <View style={[styles.clearMark, { borderColor: colors.inkFaint }]}>
            <Text variant="label" tone="inkSoft">
              ×
            </Text>
          </View>
        </Touch>
      )}
    </HandFrame>
  );
});

const styles = StyleSheet.create({
  frame: { alignSelf: 'stretch' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    minHeight: 56,
  },
  input: {
    flex: 1,
    paddingVertical: space.md,
    fontFamily: fontFamily.uiRegular,
    fontSize: 18,
    // Android measures a taller line box for this face than it draws; pinning
    // the height keeps the caret centred inside the drawn frame.
    lineHeight: 24,
  },
  clear: { alignItems: 'center', justifyContent: 'center', paddingLeft: space.sm },
  clearMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

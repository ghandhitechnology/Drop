/**
 * The page before there is anything on it.
 *
 * Drop is asleep, because nothing has happened yet — and the one thing on
 * offer is the way to make something happen.
 */

import { StyleSheet, View } from 'react-native';

import { DropCharacter } from '../../avatar';
import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';

const SLEEPER = 148;

export type EmptyStateProps = {
  onCamera: () => void;
};

export function EmptyState({ onCamera }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <DropCharacter
        state="resting"
        size={SLEEPER}
        seed="history/empty"
        announce={false}
      />

      <Text variant="title" tone="ink" style={styles.title}>
        {copy.history.empty.title}
      </Text>
      <Text variant="body" tone="inkSoft" style={styles.body}>
        {copy.history.empty.body}
      </Text>

      <Touch
        onPress={onCamera}
        accessibilityLabel={copy.history.empty.action}
        style={[
          styles.action,
          { borderColor: colors.accent, backgroundColor: colors.accentSoft },
        ]}
      >
        <Text variant="label" tone="accent">
          {copy.history.empty.action}
        </Text>
      </Touch>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', maxWidth: 280 },
  action: {
    marginTop: space.sm,
    minHeight: 52,
    minWidth: 200,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
});

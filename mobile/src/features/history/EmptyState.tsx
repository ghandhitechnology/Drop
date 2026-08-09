/**
 * The page before there is anything on it.
 *
 * Drop is asleep, because nothing has happened yet — and the one thing on
 * offer is the way to make something happen.
 */

import { StyleSheet, View } from 'react-native';

import { DropCharacter } from '../../avatar';
import { radius, space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { Text } from '../../ui/Text';

const SLEEPER = 148;

export type EmptyStateProps = {
  onCamera: () => void;
};

export function EmptyState({ onCamera }: EmptyStateProps) {
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

      <SketchButton
        onPress={onCamera}
        seed="history/empty/camera"
        filled
        radius={radius.pill}
        accessibilityLabel={copy.history.empty.action}
        style={styles.action}
        contentStyle={styles.actionContent}
      >
        <Text variant="button" tone="accent">
          {copy.history.empty.action}
        </Text>
      </SketchButton>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', maxWidth: 280 },
  action: { marginTop: space.sm, minHeight: 56, minWidth: 216 },
  actionContent: { minHeight: 56, paddingHorizontal: space.xl },
});

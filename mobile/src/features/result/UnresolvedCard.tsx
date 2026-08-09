import { StyleSheet, View } from 'react-native';

import { radius, space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';

export type UnresolvedCardProps = {
  onSearch: () => void;
  onRetake: () => void;
};

/** Recovery actions printed inside the paper Drop expands into. */
export function UnresolvedCard({ onSearch, onRetake }: UnresolvedCardProps) {
  return (
    <View style={styles.root}>
      <Text variant="title" tone="ink">
        {copy.unresolved.title}
      </Text>
      <Text variant="axis" tone="inkSoft">
        {copy.unresolved.body}
      </Text>
      <SketchButton
        onPress={onSearch}
        seed="capture/unresolved/search"
        filled
        radius={radius.pill}
        style={styles.action}
        contentStyle={styles.actionContent}
        accessibilityLabel={copy.unresolved.action}
      >
        <Text variant="note" tone="accent">
          {copy.unresolved.action}
        </Text>
      </SketchButton>
      <SketchLink
        onPress={onRetake}
        seed="capture/unresolved/retake"
        tone="inkSoft"
        variant="note"
        style={styles.retake}
        accessibilityLabel={copy.capture.retake}
      >
        {copy.capture.retake}
      </SketchLink>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: space.xl,
    gap: space.md,
  },
  action: { minHeight: 56 },
  actionContent: { minHeight: 56 },
  retake: { minHeight: 48, alignItems: 'center' },
});

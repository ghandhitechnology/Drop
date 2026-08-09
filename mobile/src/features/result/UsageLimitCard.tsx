import { StyleSheet, View } from 'react-native';

import { radius, space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';

export type UsageLimitCardProps = {
  onSearch: () => void;
  onSettings: () => void;
};

export function UsageLimitCard({ onSearch, onSettings }: UsageLimitCardProps) {
  return (
    <View style={styles.root}>
      <Text variant="title" tone="ink">
        {copy.usage.limited.title}
      </Text>
      <Text variant="axis" tone="inkSoft">
        {copy.usage.limited.body}
      </Text>
      <SketchButton
        onPress={onSearch}
        seed="capture/limited/search"
        filled
        radius={radius.pill}
        style={styles.action}
        contentStyle={styles.actionContent}
        accessibilityLabel={copy.usage.limited.search}
      >
        <Text variant="note" tone="accent">
          {copy.usage.limited.search}
        </Text>
      </SketchButton>
      <SketchLink
        onPress={onSettings}
        seed="capture/limited/settings"
        tone="inkSoft"
        variant="note"
        style={styles.secondary}
        accessibilityLabel={copy.usage.limited.settings}
      >
        {copy.usage.limited.settings}
      </SketchLink>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: space.xl, gap: space.md },
  action: { minHeight: 56 },
  actionContent: { minHeight: 56 },
  secondary: { minHeight: 48, alignItems: 'center' },
});

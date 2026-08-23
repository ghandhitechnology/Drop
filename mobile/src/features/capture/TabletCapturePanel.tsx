import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { Text } from '../../ui/Text';
import type { CaptureStateName } from './types';
import { tabletCapturePhase } from './presentation';

export type TabletCapturePanelProps = {
  state: CaptureStateName;
  showActions: boolean;
  libraryDisabled: boolean;
  onSearch: () => void;
  onLibrary: () => void;
};

/**
 * The wide-screen continuation of the camera, not another mode. The shutter
 * stays centred over the live frame; the two existing alternate capture paths
 * move onto paper beside it and the copy follows the same machine state.
 */
export function TabletCapturePanel({
  state,
  showActions,
  libraryDisabled,
  onSearch,
  onLibrary,
}: TabletCapturePanelProps) {
  const { colors } = useTheme();
  const phase = tabletCapturePhase(state);
  const words = copy.capture.tablet[phase];

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.bg, borderColor: colors.inkFaint }]}
    >
      <View style={styles.body}>
        <Text variant="chip" tone="inkSoft">
          {copy.capture.tablet.eyebrow}
        </Text>
        <View style={styles.status}>
          <Text
            variant="title"
            tone="ink"
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
          >
            {words.title}
          </Text>
          <Text variant="body" tone="inkSoft">
            {words.body}
          </Text>
        </View>

        {showActions && (
          <View style={styles.actions}>
            <SketchButton
              onPress={onSearch}
              seed="capture/tablet-find-by-name"
              filled
              radius={radius.pill}
              style={styles.action}
              contentStyle={styles.actionContent}
              accessibilityLabel={copy.capture.findByName}
              accessibilityHint={copy.capture.findByNameHint}
            >
              <Text variant="label" tone="accent">
                {copy.capture.findByName}
              </Text>
            </SketchButton>

            <SketchButton
              onPress={onLibrary}
              seed="capture/tablet-library"
              tone="ink"
              radius={radius.pill}
              disabled={libraryDisabled}
              accessibilityState={{ disabled: libraryDisabled }}
              style={styles.action}
              contentStyle={styles.actionContent}
              accessibilityLabel={copy.capture.fromLibrary}
              accessibilityHint={copy.capture.fromLibraryHint}
            >
              <Text variant="label" tone={libraryDisabled ? 'inkSoft' : 'ink'}>
                {copy.capture.fromLibrary}
              </Text>
            </SketchButton>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderLeftWidth: 1 },
  body: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xxxl + space.xl,
    paddingBottom: space.xl,
  },
  status: { gap: space.sm, maxWidth: 360 },
  actions: { gap: space.sm, marginTop: 'auto' },
  action: { minHeight: 56 },
  actionContent: { minHeight: 56, paddingHorizontal: space.lg },
});

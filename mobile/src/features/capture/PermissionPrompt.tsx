import { Canvas } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { Grain } from '../../drawing/grain';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { dropPath } from '../onboarding/marks';
import { copy } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { Text } from '../../ui/Text';
import { permissionPromptModel, type PermissionPromptMode } from './permission';

const MARK_WIDTH = 240;
const MARK_HEIGHT = 120;

export type PermissionPromptProps = {
  /** `ask` before the OS has been consulted, `settings` once the answer lives there. */
  mode: PermissionPromptMode;
  onRequest: () => void;
  /** Opens the bundled catalogue without consulting camera permission. */
  onManual: () => void;
};

/**
 * The screen before the camera.
 *
 * It says what the camera is for and keeps the catalogue beside the permission
 * action. Withholding camera access changes the input, never access to the
 * result and confirmation workflow.
 */
export function PermissionPrompt({ mode, onRequest, onManual }: PermissionPromptProps) {
  const { colors } = useTheme();
  const words = mode === 'ask' ? copy.permission.ask : copy.permission.settings;
  const prompt = permissionPromptModel(mode);

  // The same drop the welcome draws, so the two screens a person meets in
  // their first ten seconds are drawn with one shape rather than two sketches
  // of the same idea.
  const mark = useMemo(
    () => dropPath(MARK_WIDTH / 2, MARK_HEIGHT / 2, MARK_HEIGHT - 12),
    [],
  );

  const handlePress = () => {
    if (prompt.primary.destination === 'request') {
      onRequest();
      return;
    }
    Linking.openSettings();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Grain />
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <Canvas
            style={styles.canvas}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
          >
            <HandPath
              path={mark}
              color={colors.accent}
              variant="crayon"
              seed={seedFromString('capture/permission-drop')}
              strokeScale={1.2}
            />
          </Canvas>

          <Text variant="title" tone="ink" style={styles.title} accessibilityRole="header">
            {words.title}
          </Text>
          <Text variant="body" tone="inkSoft" style={styles.copy}>
            {words.body}
          </Text>

          <SketchButton
            onPress={handlePress}
            seed={`capture/permission/${mode}`}
            filled
            radius={radius.pill}
            style={styles.action}
            contentStyle={styles.actionContent}
            accessibilityLabel={prompt.primary.label}
          >
            <Text variant="label" tone="accent">
              {words.action}
            </Text>
          </SketchButton>

          <SketchButton
            onPress={onManual}
            seed={`capture/permission/${mode}/manual`}
            tone="ink"
            radius={radius.pill}
            style={styles.manualAction}
            contentStyle={styles.actionContent}
            accessibilityLabel={prompt.manual.label}
            accessibilityHint={prompt.manual.hint}
          >
            <Text variant="label" tone="ink">
              {prompt.manual.label}
            </Text>
          </SketchButton>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  canvas: { width: MARK_WIDTH, height: MARK_HEIGHT },
  title: { textAlign: 'center' },
  copy: { textAlign: 'center', maxWidth: 340 },
  action: { marginTop: space.lg, minHeight: 56 },
  manualAction: { minHeight: 56 },
  actionContent: { minHeight: 56, paddingHorizontal: space.xxl },
});

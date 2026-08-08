/**
 * The way from the camera to the record.
 *
 * It sits top-right, on its own scrim, because the bottom of the frame belongs
 * to the shutter and the bottom-left to the search control. It steps aside the
 * moment a result appears — that screen is a single decision, and a second door
 * during it is noise.
 *
 * The mark is three drawn strokes of falling length: a stack of days.
 */

import { Canvas, Skia } from '@shopify/react-native-skia';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { space } from '../../design/tokens';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { isResultVisible } from '../capture/types';
import { HandChip } from '../capture/HandChip';
import { overlayInk } from '../capture/overlay';
import { useCaptureMachine } from '../capture/useCaptureMachine';

const GLYPH = 16;
const SEED = seedFromString('history/tab');

export function HistoryTab() {
  const router = useRouter();
  const state = useCaptureMachine((s) => s.state);

  const stack = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    const lengths = [14, 10, 6];
    lengths.forEach((length, index) => {
      const y = 3 + index * 5;
      builder.moveTo(1, y).lineTo(1 + length, y);
    });
    return builder.detach();
  }, []);

  if (isResultVisible(state) || state.name === 'unresolved') return null;

  return (
    <SafeAreaView style={styles.root} pointerEvents="box-none" edges={['top']}>
      <View style={styles.align} pointerEvents="box-none">
        <HandChip
          seed="history/tab"
          onPress={() => router.push('/history')}
          accessibilityLabel={copy.history.open}
          accessibilityHint={copy.history.openHint}
        >
          <Canvas
            style={styles.glyph}
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <HandPath
              path={stack}
              color={overlayInk.mark}
              variant="pencil"
              seed={SEED}
              strokeScale={0.7}
            />
          </Canvas>
          <Text variant="label" tone={overlayInk.mark}>
            {copy.history.open}
          </Text>
        </HandChip>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
  align: { alignItems: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.md },
  glyph: { width: GLYPH, height: GLYPH },
});

import { Canvas, Skia } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSchemePreference, useTheme } from '../src/design/theme';
import { useMotion, useMotionPreference } from '../src/design/useMotion';
import { duration } from '../src/design/motion';
import {
  colorTokenNames,
  palette,
  radius,
  space,
  type ColorTokens,
} from '../src/design/tokens';
import type { TextVariant } from '../src/design/typography';
import { Grain } from '../src/drawing/grain';
import { HandFrame } from '../src/drawing/HandFrame';
import { HandPath } from '../src/drawing/HandPath';
import { seedFromString } from '../src/drawing/seededRandom';
import { Text } from '../src/ui/Text';
import { Touch } from '../src/ui/Touch';

const DEMO_WIDTH = 300;
const DEMO_HEIGHT = 120;

const TEXT_SAMPLES: { variant: TextVariant; sample: string }[] = [
  { variant: 'hero', sample: '1,240' },
  { variant: 'heroUnit', sample: 'litres' },
  { variant: 'title', sample: 'Oat flat white' },
  { variant: 'chip', sample: 'HIGH CONFIDENCE' },
  { variant: 'body', sample: 'Water use across growing, processing, and transport.' },
  { variant: 'label', sample: 'Per serving' },
  { variant: 'button', sample: 'Add to history' },
  { variant: 'note', sample: 'Hold the camera over the plate' },
];

/* ---------------------------------------------------------------- sections */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="chip" tone="inkSoft" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.controlRow}>
      <Text variant="label" tone="inkSoft" style={styles.controlLabel}>
        {label}
      </Text>
      <View style={styles.segments}>
        {options.map((option) => {
          const active = option === value;
          return (
            <Touch
              key={option}
              onPress={() => onChange(option)}
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${option}`}
              style={[
                styles.segment,
                {
                  backgroundColor: active ? colors.accentSoft : 'transparent',
                  borderColor: active ? colors.accent : colors.inkFaint,
                },
              ]}
            >
              <Text variant="chip" tone={active ? 'accent' : 'inkSoft'}>
                {option}
              </Text>
            </Touch>
          );
        })}
      </View>
    </View>
  );
}

/** The M0 gate: a Skia path with DiscretePathEffect, trimmed by Reanimated. */
function DrawOnDemo() {
  const { colors } = useTheme();
  const motion = useMotion();
  const progress = useSharedValue(0);

  const path = useMemo(
    () =>
      Skia.PathBuilder.Make()
        .moveTo(14, 74)
        .cubicTo(56, 4, 104, 120, 152, 62)
        .cubicTo(196, 10, 242, 116, 286, 48)
        .detach(),
    [],
  );

  const replay = useCallback(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motion.ms('draw') || 1,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, motion]);

  useEffect(() => {
    replay();
  }, [replay]);

  return (
    <View>
      <Canvas style={styles.demoCanvas}>
        <HandPath
          path={path}
          color={colors.ink}
          variant="pencil"
          seed={seedFromString('kitchen-sink/draw-on')}
          end={progress}
        />
      </Canvas>
      <Touch onPress={replay} style={styles.replay} accessibilityLabel="Replay the draw-on animation">
        <Text variant="label" tone="accent">
          Replay
        </Text>
      </Touch>
      <Text variant="body" tone="inkSoft">
        Path trim {0}
        {' → '}1 over {motion.reduceMotion ? 'no' : `${duration.draw}ms`} of motion.
      </Text>
    </View>
  );
}

function MarkSamples() {
  const { colors } = useTheme();

  const wave = useMemo(
    () =>
      Skia.PathBuilder.Make()
        .moveTo(12, 40)
        .cubicTo(52, 4, 96, 76, 140, 40)
        .cubicTo(184, 4, 226, 76, 268, 40)
        .detach(),
    [],
  );

  const underline = useMemo(
    () => Skia.PathBuilder.Make().moveTo(12, 22).lineTo(268, 26).detach(),
    [],
  );

  return (
    <View style={styles.markGrid}>
      {(['pencil', 'crayon'] as const).map((variant) => (
        <View key={variant} style={styles.markCell}>
          <Text variant="label" tone="inkSoft">
            {variant}
          </Text>
          <Canvas style={styles.markCanvas}>
            <HandPath
              path={wave}
              color={colors.ink}
              variant={variant}
              seed={seedFromString(`sample/${variant}`)}
            />
          </Canvas>
          <Canvas style={styles.underlineCanvas}>
            <HandPath
              path={underline}
              color={colors.accent}
              variant={variant}
              seed={seedFromString(`underline/${variant}`)}
            />
          </Canvas>
        </View>
      ))}
    </View>
  );
}

function TokenColumn({
  name,
  colors,
}: {
  name: string;
  colors: ColorTokens;
}) {
  return (
    <View style={[styles.tokenColumn, { backgroundColor: colors.bg, borderColor: colors.inkFaint }]}>
      <Text variant="label" style={[styles.tokenHeading, { color: colors.ink }]}>
        {name}
      </Text>
      {colorTokenNames.map((token) => (
        <View key={token} style={styles.tokenRow}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: colors[token], borderColor: colors.inkFaint },
            ]}
          />
          <Text variant="chip" style={[styles.tokenName, { color: colors.inkSoft }]}>
            {token}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ screen */

export default function KitchenSink() {
  const { colors } = useTheme();
  const { preference: schemePref, setScheme } = useSchemePreference();
  const { preference: motionPref, setMotion } = useMotionPreference();
  const [grainOn, setGrainOn] = useState(true);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {grainOn && <Grain />}
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text variant="title">Kitchen sink</Text>

          <Section title="Controls">
            <Segmented
              label="Theme"
              options={['system', 'light', 'dark'] as const}
              value={schemePref}
              onChange={setScheme}
            />
            <Segmented
              label="Motion"
              options={['system', 'full', 'reduced'] as const}
              value={motionPref}
              onChange={setMotion}
            />
            <Segmented
              label="Grain"
              options={['on', 'off'] as const}
              value={grainOn ? 'on' : 'off'}
              onChange={(next) => setGrainOn(next === 'on')}
            />
          </Section>

          <Section title="Draw on">
            <DrawOnDemo />
          </Section>

          <Section title="Type scale">
            {TEXT_SAMPLES.map(({ variant, sample }) => (
              <View key={variant} style={styles.typeRow}>
                <Text variant="chip" tone="inkSoft">
                  {variant}
                </Text>
                <Text variant={variant}>{sample}</Text>
              </View>
            ))}
          </Section>

          <Section title="Marks">
            <MarkSamples />
          </Section>

          <Section title="Frame">
            <HandFrame
              seed={seedFromString('kitchen-sink/frame')}
              style={styles.frame}
              contentStyle={styles.frameContent}
            >
              <Text variant="heroUnit">Oat milk</Text>
              <Text variant="body" tone="inkSoft">
                A sketched frame drawn with the same hand as every other mark.
              </Text>
            </HandFrame>

            <HandFrame
              seed={seedFromString('kitchen-sink/frame-crayon')}
              variant="crayon"
              color={colors.accent}
              style={styles.frame}
              contentStyle={styles.frameContent}
            >
              <Text variant="label" tone="accent">
                Crayon frame
              </Text>
            </HandFrame>
          </Section>

          <Section title="Colour tokens">
            <View style={styles.tokenGrid}>
              <TokenColumn name="Light" colors={palette.light} />
              <TokenColumn name="Dark" colors={palette.dark} />
            </View>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: space.xl, gap: space.xl, paddingBottom: space.xxxl },

  section: { gap: space.md },
  sectionTitle: { letterSpacing: 1 },

  controlRow: { gap: space.sm },
  controlLabel: {},
  segments: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  segment: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },

  demoCanvas: { width: DEMO_WIDTH, height: DEMO_HEIGHT },
  replay: { alignSelf: 'flex-start', paddingVertical: space.sm },

  typeRow: { gap: space.xs },

  markGrid: { gap: space.xl },
  markCell: { gap: space.sm },
  markCanvas: { width: 280, height: 84 },
  underlineCanvas: { width: 280, height: 40 },

  frame: { marginBottom: space.md },
  frameContent: { padding: space.xl, gap: space.sm },

  tokenGrid: { flexDirection: 'row', gap: space.md },
  tokenColumn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  tokenHeading: { marginBottom: space.xs },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 1 },
  tokenName: { flexShrink: 1 },
});

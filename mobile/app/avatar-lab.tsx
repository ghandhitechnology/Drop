import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DropCharacter } from '../src/avatar/DropCharacter';
import { avatarCopy } from '../src/avatar/copy';
import { CHARACTER_STATES, poseFor, presentingVariant } from '../src/avatar/poses';
import type { CharacterState } from '../src/avatar/poses';
import { useSchemePreference, useTheme } from '../src/design/theme';
import { useMotionPreference } from '../src/design/useMotion';
import { radius, space } from '../src/design/tokens';
import { seedFromString } from '../src/drawing/seededRandom';
import { Grain } from '../src/drawing/grain';
import { HandFrame } from '../src/drawing/HandFrame';
import { Text } from '../src/ui/Text';
import { Touch } from '../src/ui/Touch';

/** Long enough to watch a state settle, short enough to see the whole loop. */
const CYCLE_MS = 2600;

/** Stand-ins for history rows, to check the 24dp end of the range. */
const HISTORY = [
  { id: 'oat-flat-white', title: 'Oat flat white', detail: '138 L' },
  { id: 'beef-taco', title: 'Beef taco', detail: '2,340 L' },
  { id: 'cotton-tee', title: 'Cotton tee', detail: '2,700 L' },
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text variant="chip" tone="inkSoft" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </Text>
      {note ? (
        <Text variant="body" tone="inkSoft">
          {note}
        </Text>
      ) : null}
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
      <Text variant="label" tone="inkSoft">
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

/**
 * The avatar bench.
 *
 * Everything about DropCharacter that is worth looking at is on this screen:
 * the full state loop at hero size, all seven states side by side at the
 * default size, the 24dp row size, and the two toggles that change how it
 * behaves.
 */
export default function AvatarLab() {
  const { colors } = useTheme();
  const { preference: schemePref, setScheme } = useSchemePreference();
  const { preference: motionPref, setMotion } = useMotionPreference();

  const [index, setIndex] = useState(0);
  const [cycling, setCycling] = useState(true);
  // 'hero' leaves one avatar on screen, which is what a real screen costs.
  // 'all' is the stress case: every size and state animating at once.
  const [scope, setScope] = useState<'hero' | 'all'>('all');
  const state = CHARACTER_STATES[index];

  const advance = () =>
    setIndex((current) => (current + 1) % CHARACTER_STATES.length);

  useEffect(() => {
    if (!cycling) return;
    const timer = setInterval(advance, CYCLE_MS);
    return () => clearInterval(timer);
  }, [cycling]);

  const heroSeed = useMemo(() => seedFromString('avatar-lab/hero'), []);
  const heroPose = poseFor(state, heroSeed, false);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Grain />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text variant="title">Avatar lab</Text>

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
              label="Cycle"
              options={['on', 'off'] as const}
              value={cycling ? 'on' : 'off'}
              onChange={(next) => setCycling(next === 'on')}
            />
            <Segmented
              label="On screen"
              options={['hero', 'all'] as const}
              value={scope}
              onChange={setScope}
            />
          </Section>

          <Section title="Hero — 200dp" note="Tap Drop to move to the next state.">
            <View style={styles.heroRow}>
              <DropCharacter
                state={state}
                size={200}
                seed="avatar-lab/hero"
                onPress={advance}
              />
              <View style={styles.heroMeta}>
                <Text variant="title">{state}</Text>
                <Text variant="body" tone="inkSoft">
                  {avatarCopy.state[state]}
                </Text>
                <Text variant="label" tone="accent">
                  {heroPose}
                </Text>
              </View>
            </View>
          </Section>

          {scope === 'all' && (
          <Section title="States — 64dp">
            <View style={styles.grid}>
              {CHARACTER_STATES.map((each) => {
                const active = each === state;
                return (
                  <Touch
                    key={each}
                    onPress={() => setIndex(CHARACTER_STATES.indexOf(each))}
                    accessibilityLabel={`Show ${each}`}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.gridCell,
                      {
                        backgroundColor: active ? colors.accentSoft : 'transparent',
                        borderColor: active ? colors.accent : 'transparent',
                      },
                    ]}
                  >
                    <DropCharacter
                      state={each}
                      size={64}
                      seed={`avatar-lab/${each}`}
                      announce={false}
                    />
                    <Text variant="chip" tone={active ? 'accent' : 'inkSoft'}>
                      {each}
                    </Text>
                  </Touch>
                );
              })}
            </View>
          </Section>
          )}

          {scope === 'all' && (
          <Section
            title="Presenting variants"
            note="Two poses, picked from the seed so an item always presents the same way."
          >
            <View style={styles.variantRow}>
              {['point', 'cheer'].map((tag) => {
                const seed = tag === 'point' ? 'variant/point' : 'variant/cheer';
                return (
                  <View key={tag} style={styles.variantCell}>
                    <DropCharacter
                      state="presenting"
                      size={96}
                      seed={seed}
                      announce={false}
                    />
                    <Text variant="chip" tone="inkSoft">
                      {presentingVariant(seedFromString(seed))}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Section>
          )}

          {scope === 'all' && (
          <Section title="History rows — 24dp">
            <HandFrame
              seed={seedFromString('avatar-lab/history')}
              style={styles.historyFrame}
              contentStyle={styles.historyContent}
            >
              {HISTORY.map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <DropCharacter
                    state="resting"
                    size={24}
                    seed={item.id}
                    announce={false}
                  />
                  <Text variant="body" style={styles.historyTitle}>
                    {item.title}
                  </Text>
                  <Text variant="label" tone="inkSoft">
                    {item.detail}
                  </Text>
                </View>
              ))}
            </HandFrame>
          </Section>
          )}
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
  segments: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  segment: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroMeta: { flex: 1, gap: space.xs },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridCell: {
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    width: 96,
  },

  variantRow: { flexDirection: 'row', gap: space.xl },
  variantCell: { alignItems: 'center', gap: space.xs },

  historyFrame: {},
  historyContent: { padding: space.lg, gap: space.md },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  historyTitle: { flex: 1 },
});

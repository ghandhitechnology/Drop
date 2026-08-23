/**
 * Settings.
 *
 * Three sections and nothing else: how Drop looks, how it reads, and where its
 * numbers come from. Every control applies the instant it is pressed — there is
 * no save button, because a settings screen with one can be left in a state
 * nobody chose.
 *
 * The last section is the point of the screen. Drop's whole claim is that a
 * litre traces to a published study, and this is where that claim is checkable:
 * the names, releases, and rights are read out of the active factor release,
 * not typed into a credits list that quietly goes stale.
 */
import { Canvas, Skia } from '@shopify/react-native-skia';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import * as Updates from 'expo-updates';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getFactorsVersion, subscribeFactorsVersion } from '../../data/tables';
import { readAvailableRelease, type AvailableRelease } from '../../data/sync';
import { usePreferences } from '../../design/preferences';
import { useTheme } from '../../design/theme';
import { MIN_TOUCH_SIZE, radius, space } from '../../design/tokens';
import { useMotion, useMotionPreference } from '../../design/useMotion';
import { Grain } from '../../drawing/grain';
import { HandFrame } from '../../drawing/HandFrame';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy, printDate } from '../../lib/copy';
import { tapSelection } from '../../lib/haptics';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import { catalogSize, datasetCredits } from './datasets';
import { HandSwitch } from './HandSwitch';
import { ThemeChoice } from './ThemeChoice';
import { UsageCard } from './UsageCard';
import { useUsage } from '../usage';

export type SettingsScreenProps = {
  onDone: () => void;
};

export function SettingsScreen({ onDone }: SettingsScreenProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const { setMotion } = useMotionPreference();

  const texture = usePreferences((s) => s.texture);
  const setTexture = usePreferences((s) => s.setTexture);
  const legibleText = usePreferences((s) => s.legibleText);
  const setLegibleText = usePreferences((s) => s.setLegibleText);

  const [release, setRelease] = useState<AvailableRelease | null>(null);
  const refreshUsage = useUsage((state) => state.refresh);
  const factorsVersion = useSyncExternalStore(
    subscribeFactorsVersion,
    getFactorsVersion,
    getFactorsVersion,
  );

  useFocusEffect(
    useCallback(() => {
      refreshUsage().catch(() => {});
    }, [refreshUsage]),
  );

  // The external-store subscription rerenders this screen when the complete
  // active table set changes, so attribution is always read from that set.
  const credits = datasetCredits({
    release: copy.settings.about.release,
    rights: copy.settings.about.rights,
    source: copy.settings.about.source,
  });
  const catalog = catalogSize();

  /**
   * The exact build in hand, said once at the tail of the screen.
   *
   * A tester's report is only as good as the build it names, so this reads the
   * running app rather than a constant: the app version with its update
   * channel, then the OTA update actually loaded — its id's opening run and
   * the day it was published — or the note that the bundle came with the build.
   */
  const build = useMemo(() => {
    const version = Constants.expoConfig?.version ?? '1.0.0';
    const channel = Updates.channel;
    return {
      app: channel
        ? copy.settings.version.appChannel(version, channel)
        : copy.settings.version.app(version),
      bundle: Updates.updateId
        ? copy.settings.version.update(
            Updates.updateId.slice(0, 8),
            Updates.createdAt ? printDate(Updates.createdAt) : '',
          )
        : copy.settings.version.embedded,
    };
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(copy.settings.announce.opened);
    let live = true;
    readAvailableRelease()
      .then((found) => {
        if (live) setRelease(found);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const toggle = (apply: () => void) => () => {
    tapSelection();
    apply();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Grain />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text variant="title" tone="ink">
            {copy.settings.title}
          </Text>
          <SketchLink
            onPress={onDone}
            seed="settings/done"
            style={styles.done}
            accessibilityLabel={copy.settings.done}
            accessibilityHint={copy.settings.doneHint}
          >
            {copy.settings.done}
          </SketchLink>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Section title={copy.usage.title}>
            <UsageCard />
          </Section>

          <Section title={copy.settings.appearance.title}>
            <ThemeChoice />
          </Section>

          <Section title={copy.settings.reading.title}>
            <SwitchRow
              name="clearer-text"
              title={copy.settings.reading.clearerText}
              body={copy.settings.reading.clearerTextBody}
              value={legibleText}
              onToggle={toggle(() => setLegibleText(!legibleText))}
            />
            <SwitchRow
              name="reduce-texture"
              title={copy.settings.reading.reduceTexture}
              body={copy.settings.reading.reduceTextureBody}
              // The stored preference is "texture on"; the row asks the
              // opposite question, so that the switch and its label agree.
              value={!texture}
              onToggle={toggle(() => setTexture(!texture))}
            />
            <SwitchRow
              name="reduce-motion"
              title={copy.settings.reading.reduceMotion}
              body={copy.settings.reading.reduceMotionBody}
              // Shows what is actually in force, including the phone's own
              // setting, and takes over the moment it is touched.
              value={motion.reduceMotion}
              onToggle={toggle(() => setMotion(motion.reduceMotion ? 'full' : 'reduced'))}
            />
          </Section>

          <Section title={copy.settings.about.title}>
            <Text variant="body" tone="inkSoft">
              {copy.settings.about.body}
            </Text>

            <View style={styles.facts}>
              <Text variant="label" tone="ink">
                {copy.settings.about.tables(factorsVersion)}
              </Text>
              <Text variant="label" tone="inkSoft">
                {copy.settings.about.catalog(String(catalog))}
              </Text>
            </View>

            {release ? (
              <HandFrame
                seed={seedFromString('settings/update')}
                variant="crayon"
                color={colors.accent}
                radius={radius.md}
                style={[styles.notice, { backgroundColor: colors.accentSoft }]}
                contentStyle={styles.noticeContent}
              >
                <Text variant="label" tone="accent">
                  {copy.settings.update.ready(release.version)}
                </Text>
                <Text variant="chip" tone="inkSoft">
                  {copy.settings.update.body}
                </Text>
              </HandFrame>
            ) : (
              <Text variant="chip" tone="inkSoft">
                {copy.settings.update.current}
              </Text>
            )}

            <View style={styles.credits}>
              {credits.map((credit) => (
                <View key={credit.id} style={styles.credit}>
                  <Text variant="label" tone="ink">
                    {credit.name}
                  </Text>
                  {credit.lines.map((line) => (
                    <Text key={line.label} variant="chip" tone="inkSoft">
                      {line.value}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </Section>

          {/* The tail: the build in hand, for naming in a report. */}
          <View
            style={styles.version}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${build.app}. ${build.bundle}.`}
          >
            <Text variant="chip" tone="inkSoft">
              {build.app}
            </Text>
            <Text variant="chip" tone="inkSoft">
              {build.bundle}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/* ------------------------------------------------------------- sections */

/**
 * A heading, a drawn rule under it, and its controls.
 *
 * More air above the heading than below it, so the heading belongs to what
 * follows rather than floating between two groups.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="inkSoft" accessibilityRole="header">
        {title}
      </Text>
      <Rule seed={seedFromString(`settings/rule/${title}`)} />
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const RULE_HEIGHT = 8;

/** One pencil line, ruled under a heading. */
function Rule({ seed }: { seed: number }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const path = useMemo(
    () =>
      width > 0
        ? Skia.PathBuilder.Make()
            .moveTo(0, RULE_HEIGHT / 2)
            .lineTo(width, RULE_HEIGHT / 2)
            .detach()
        : null,
    [width],
  );

  return (
    <View style={styles.rule} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {path && (
        <Canvas
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <HandPath
            path={path}
            color={colors.inkFaint}
            variant="pencil"
            seed={seed}
            strokeScale={0.6}
          />
        </Canvas>
      )}
    </View>
  );
}

/* ---------------------------------------------------------------- a row */

type SwitchRowProps = {
  name: string;
  title: string;
  body: string;
  value: boolean;
  onToggle: () => void;
};

/**
 * The whole row is the switch.
 *
 * The drawn control is 54×30, which no thumb should have to find: the target is
 * the full-width row, and the row carries the switch role and its checked
 * state, so the platform announces the change without a word from us.
 */
function SwitchRow({ name, title, body, value, onToggle }: SwitchRowProps) {
  return (
    <Touch
      onPress={onToggle}
      style={styles.row}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={body}
      accessibilityState={{ checked: value }}
    >
      <View style={styles.rowWords}>
        <Text variant="label" tone="ink">
          {title}
        </Text>
        <Text variant="chip" tone="inkSoft">
          {body}
        </Text>
      </View>
      <HandSwitch value={value} name={name} />
    </Touch>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  done: { minHeight: MIN_TOUCH_SIZE, paddingLeft: space.lg },

  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },

  section: { paddingTop: space.xxl },
  sectionBody: { paddingTop: space.md, gap: space.md },
  rule: { height: RULE_HEIGHT, marginTop: space.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    minHeight: 56,
    paddingVertical: space.xs,
  },
  rowWords: { flex: 1, gap: 2 },

  facts: { gap: space.xs },

  notice: { borderRadius: radius.md, overflow: 'hidden' },
  noticeContent: { padding: space.lg, gap: space.xs },

  credits: { paddingTop: space.sm, gap: space.lg },
  credit: { gap: 3 },

  version: { paddingTop: space.xxl, alignItems: 'center', gap: 2 },
});

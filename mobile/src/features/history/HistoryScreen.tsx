/**
 * The record: today's figure, the shape of the last week or month, and every
 * entry underneath it.
 *
 * One scroll. The figure and the chart ride at the top of the list rather than
 * in a fixed band, because on a phone a person wants the entries and a header
 * that refuses to leave costs them a third of the screen. Day headers stick, so
 * the day a row belongs to is never off screen.
 *
 * Removing is the only write this screen makes, it always comes from a
 * deliberate gesture or a screen-reader action, and the way back stays open for
 * five seconds afterwards.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { tapRemoving } from '../../lib/haptics';
import { localDay } from '../../lib/time';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import type { Entry } from '../../data/types';
import { DayHeader } from './DayHeader';
import { seedHistory } from './devSeed';
import { EmptyState } from './EmptyState';
import { EntryRow } from './EntryRow';
import { litresSpoken } from './format';
import { groupByDay, useHistoryStore, type ChartRange } from './store';
import { TodayHeader } from './TodayHeader';
import { TrendChart } from './TrendChart';
import { UndoBar } from './UndoBar';

export function HistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const status = useHistoryStore((s) => s.status);
  const entries = useHistoryStore((s) => s.entries);
  const today = useHistoryStore((s) => s.today);
  const week = useHistoryStore((s) => s.week);
  const month = useHistoryStore((s) => s.month);
  const range = useHistoryStore((s) => s.range);
  const pending = useHistoryStore((s) => s.pending);
  const load = useHistoryStore((s) => s.load);
  const setRange = useHistoryStore((s) => s.setRange);
  const remove = useHistoryStore((s) => s.remove);
  const restore = useHistoryStore((s) => s.restore);

  const [seeding, setSeeding] = useState(false);
  const announced = useRef(false);

  // Re-read on every arrival: a confirmation may have landed on the camera
  // screen, or an entry may have been removed from its own detail page.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (status !== 'ready' || announced.current) return;
    announced.current = true;
    AccessibilityInfo.announceForAccessibility(
      copy.history.announce.opened(litresSpoken(today.totalLitres)),
    );
  }, [status, today.totalLitres]);

  const sections = useMemo(() => groupByDay(entries), [entries]);
  const todayKey = today.localDay || localDay();
  const days = range === 7 ? week : month;

  const openEntry = useCallback(
    (id: string) => router.push(`/history/${id}`),
    [router],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      tapRemoving();
      await remove(id);
      const next = useHistoryStore.getState();
      AccessibilityInfo.announceForAccessibility(
        copy.history.announce.removed(
          next.pending?.label ?? '',
          litresSpoken(next.today.totalLitres),
        ),
      );
    },
    [remove],
  );

  const handleRestore = useCallback(async () => {
    const label = useHistoryStore.getState().pending?.label ?? '';
    await restore();
    const next = useHistoryStore.getState();
    AccessibilityInfo.announceForAccessibility(
      copy.history.announce.restored(label, litresSpoken(next.today.totalLitres)),
    );
  }, [restore]);

  const handleRange = useCallback(
    (next: ChartRange) => {
      setRange(next);
      AccessibilityInfo.announceForAccessibility(
        copy.history.announce.range(
          next === 7 ? copy.history.spanWeek : copy.history.spanMonth,
        ),
      );
    },
    [setRange],
  );

  // Reached from the camera nearly always, and by a deep link occasionally.
  // The second case has nothing behind it, so the camera is navigated to.
  const goCamera = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const runSeed = useCallback(async () => {
    setSeeding(true);
    try {
      await seedHistory(40);
      await load();
    } finally {
      setSeeding(false);
    }
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <EntryRow entry={item} onOpen={openEntry} onRemove={handleRemove} />
    ),
    [openEntry, handleRemove],
  );

  const empty = status === 'ready' && entries.length === 0;

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.bg }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.bar}>
        <SketchLink
          onPress={goCamera}
          seed="history/back-to-camera"
          accessibilityLabel={copy.history.back}
          style={styles.back}
        >
          {copy.history.back}
        </SketchLink>
      </View>

      {empty ? (
        <View style={styles.emptyWrap}>
          <EmptyState onCamera={goCamera} />
          <DevSeed seeding={seeding} onSeed={runSeed} />
        </View>
      ) : (
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <DayHeader
              day={section.day}
              total={section.total}
              todayKey={todayKey}
            />
          )}
          stickySectionHeadersEnabled
          ListHeaderComponent={
            <View style={styles.header}>
              <Text variant="title" tone="ink" accessibilityRole="header">
                {copy.history.title}
              </Text>
              <TodayHeader litres={today.totalLitres} />
              <TrendChart
                days={days}
                range={range}
                todayKey={todayKey}
                onRange={handleRange}
              />
            </View>
          }
          ListFooterComponent={<DevSeed seeding={seeding} onSeed={runSeed} />}
          contentContainerStyle={styles.content}
          initialNumToRender={12}
          windowSize={9}
        />
      )}

      {pending && <UndoBar label={pending.label} onRestore={handleRestore} />}
    </SafeAreaView>
  );
}

/** Developer affordance. It ships out of the bundle in a release build. */
function DevSeed({ seeding, onSeed }: { seeding: boolean; onSeed: () => void }) {
  if (!__DEV__) return null;
  return (
    <SketchButton
      onPress={onSeed}
      disabled={seeding}
      seed="history/dev-seed"
      tone="quiet"
      radius={radius.pill}
      scale={0.8}
      accessibilityLabel={seeding ? copy.history.seeding : copy.history.seed}
      accessibilityState={{ disabled: seeding }}
      style={[styles.seed, { opacity: seeding ? 0.5 : 1 }]}
      contentStyle={styles.seedContent}
    >
      <Text variant="chip" tone="inkSoft">
        {seeding ? copy.history.seeding : copy.history.seed}
      </Text>
    </SketchButton>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { flex: 1 },
  bar: { paddingHorizontal: space.lg, paddingTop: space.sm },
  back: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  content: { paddingBottom: space.xxxl * 2 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.xl },
  seed: { alignSelf: 'center', marginTop: space.xl, minHeight: 46 },
  seedContent: { minHeight: 46, paddingHorizontal: space.lg },
});

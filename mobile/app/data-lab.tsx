/**
 * Data lab — a developer route for the local data layer (M3).
 *
 * Everything on this screen goes through the shipping code path: the real
 * engine produces the estimate, the real repository writes it, and the totals
 * are read back off the maintained `daily_totals` aggregate rather than
 * recomputed for display.
 */
import { estimate as runEstimate } from '@drop/water-engine';
import type { Confidence, Estimate, MetricType, QuantityUnit } from '@drop/water-engine';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFirstRun } from '../src/features/onboarding';
import { useTheme } from '../src/design/theme';
import { space } from '../src/design/tokens';
import { HandFrame } from '../src/drawing/HandFrame';
import { seedFromString } from '../src/drawing/seededRandom';
import { Text } from '../src/ui/Text';
import { Touch } from '../src/ui/Touch';
import {
  FACTORS_VERSION,
  clearAllData,
  entryCounts,
  getTables,
  hydrateCatalog,
  insertConfirmed,
  journalMode,
  listByDay,
  normalizeForSearch,
  schemaVersion,
  softDelete,
  tableSizes,
  todayTotal,
  trends,
  undoDelete,
  useCatalogStore,
  type DailyTotal,
  type Entry,
  type SearchHit,
} from '../src/data';
import { localDay, localWeek } from '../src/lib/time';

/* ------------------------------------------------------------ vocabulary -- */

const CONFIDENCE_CHIP: Record<Confidence, string> = {
  high: 'solid match',
  medium: 'close match',
  low: 'rough estimate',
  very_low: 'ballpark',
};

const METRIC_LABEL: Record<MetricType, string> = {
  total_water_footprint: 'total water footprint',
  freshwater_withdrawal: 'freshwater withdrawal',
  freshwater_consumption: 'freshwater consumption',
  scarcity_weighted_water_use: 'scarcity-weighted water use',
};

/** The three confirmations the sample button replays, one per category. */
const SAMPLES: { id: string; value: number; unit: QuantityUnit; note: string }[] = [
  { id: 'apple', value: 0.15, unit: 'kg', note: 'One piece of fruit' },
  { id: 'coffee_standard', value: 0.125, unit: 'l', note: 'A cup, brewed' },
  { id: 'transport_bus', value: 10, unit: 'km', note: 'Ten kilometres by bus' },
];

/* -------------------------------------------------------------- helpers -- */

function litres(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString();
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function rangeText(low: number | null, high: number | null): string | null {
  if (low === null || high === null) return null;
  return `${litres(low)}–${litres(high)} L`;
}

function now(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return perf?.now ? perf.now() : Date.now();
}

/* -------------------------------------------------------------- pieces --- */

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label" tone="inkSoft" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="label" tone="ink" style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  tone = 'accent',
  busy = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'ink';
  busy?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Touch
      onPress={onPress}
      disabled={busy}
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      style={[
        styles.button,
        {
          borderColor: tone === 'accent' ? colors.accent : colors.inkFaint,
          backgroundColor: tone === 'accent' ? colors.accentSoft : 'transparent',
          opacity: busy ? 0.5 : 1,
        },
      ]}
    >
      <Text variant="label" tone={tone === 'accent' ? 'accent' : 'inkSoft'}>
        {label}
      </Text>
    </Touch>
  );
}

function Chip({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { borderColor: colors.inkFaint }]}>
      <Text variant="chip" tone="inkSoft">
        {text}
      </Text>
    </View>
  );
}

function EntryCard({
  entry,
  onDelete,
}: {
  entry: Entry;
  onDelete: (entry: Entry) => void;
}) {
  const range = rangeText(entry.litres_low, entry.litres_high);
  const proxy = entry.estimate.headline?.proxy_metric ?? false;

  return (
    <HandFrame
      seed={seedFromString(entry.id)}
      style={styles.card}
      contentStyle={styles.cardContent}
    >
      <View style={styles.cardHead}>
        <View style={styles.cardHeadText}>
          <Text variant="label" tone="ink">
            {entry.item_label}
          </Text>
          <Text variant="body" tone="inkSoft">
            {entry.quantity_value} {entry.quantity_unit} · {entry.category}
          </Text>
        </View>
        <View style={styles.cardFigure}>
          <Text variant="title" tone="ink">
            {litres(entry.litres)} L
          </Text>
          {range ? (
            <Text variant="body" tone="inkSoft">
              {range}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.chips}>
        {entry.confidence ? <Chip text={CONFIDENCE_CHIP[entry.confidence]} /> : null}
        <Chip text={`Metric: ${METRIC_LABEL[entry.metric_type]}`} />
        {proxy ? <Chip text="proxy figure" /> : null}
        <Chip text={entry.input_method} />
      </View>

      <Text variant="body" tone="inkSoft">
        Frozen snapshot {entry.estimate_json.length.toLocaleString()} bytes · factors{' '}
        {entry.factors_version}
      </Text>

      <Touch
        onPress={() => onDelete(entry)}
        accessibilityLabel={`Remove ${entry.item_label} from today`}
        style={styles.cardAction}
      >
        <Text variant="label" tone="accent">
          Remove
        </Text>
      </Touch>
    </HandFrame>
  );
}

/* ---------------------------------------------------------------- screen -- */

export default function DataLab() {
  const { colors } = useTheme();

  const [health, setHealth] = useState({
    journal: '…',
    schema: 0,
    live: 0,
    deleted: 0,
    catalogRows: 0,
  });
  const [total, setTotal] = useState<DailyTotal | null>(null);
  const [today, setToday] = useState<Entry[]>([]);
  const [week, setWeek] = useState<DailyTotal[]>([]);
  const [lastRemoved, setLastRemoved] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Warming up.');

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchMs, setSearchMs] = useState(0);

  const catalogStatus = useCatalogStore((s) => s.status);
  const catalogItems = useCatalogStore((s) => s.items);
  const hydrationMs = useCatalogStore((s) => s.hydrationMs);
  const catalogError = useCatalogStore((s) => s.error);

  const engineSizes = useMemo(() => tableSizes(), []);
  const dayKey = useMemo(() => localDay(), []);
  const weekKey = useMemo(() => localWeek(), []);

  const say = useCallback((message: string) => {
    setStatus(message);
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const refresh = useCallback(async () => {
    const [journal, schema, counts, dayTotals, entries, series] = await Promise.all([
      journalMode(),
      schemaVersion(),
      entryCounts(),
      todayTotal(),
      listByDay(localDay()),
      trends(7),
    ]);
    setHealth((current) => ({
      ...current,
      journal,
      schema,
      live: counts.live,
      deleted: counts.deleted,
    }));
    setTotal(dayTotals);
    setToday(entries);
    setWeek(series);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      await hydrateCatalog();
      if (!live) return;
      await refresh();
      if (!live) return;
      setHealth((current) => ({
        ...current,
        catalogRows: useCatalogStore.getState().items.length,
      }));
      say('Data lab ready.');
    })();
    return () => {
      live = false;
    };
  }, [refresh, say]);

  const addSamples = useCallback(async () => {
    setBusy(true);
    try {
      const tables = getTables();
      let added = 0;
      for (const sample of SAMPLES) {
        const value: Estimate = runEstimate(
          {
            catalog_id: sample.id,
            quantity: { value: sample.value, unit: sample.unit, source: 'catalog_default' },
          },
          tables,
        );
        await insertConfirmed(value, { inputMethod: 'sample', note: sample.note });
        added += 1;
      }
      await refresh();
      say(`${added} sample entries confirmed into today.`);
    } catch (error) {
      say(`Sample insert stopped: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [refresh, say]);

  const remove = useCallback(
    async (entry: Entry) => {
      await softDelete(entry.id);
      setLastRemoved(entry);
      await refresh();
      say(`${entry.item_label} removed. Undo is available.`);
    },
    [refresh, say],
  );

  const undo = useCallback(async () => {
    if (!lastRemoved) return;
    await undoDelete(lastRemoved.id);
    const restored = lastRemoved.item_label;
    setLastRemoved(null);
    await refresh();
    say(`${restored} restored to today.`);
  }, [lastRemoved, refresh, say]);

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      await clearAllData();
      setLastRemoved(null);
      await hydrateCatalog({ force: true });
      await refresh();
      setHealth((current) => ({
        ...current,
        catalogRows: useCatalogStore.getState().items.length,
      }));
      say('Database emptied and the catalog reseeded.');
    } finally {
      setBusy(false);
    }
  }, [refresh, say]);

  /**
   * Offers the first run again, leaving history alone.
   *
   * The gate reads the store rather than the database, so clearing the flag
   * moves the app to the welcome on the next render — no relaunch needed.
   */
  const router = useRouter();
  const replayFirstRun = useFirstRun((s) => s.replay);
  const showOnboarding = useCallback(async () => {
    await replayFirstRun();
    router.replace('/');
  }, [replayFirstRun, router]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onQuery = useCallback(
    (next: string) => {
      setQuery(next);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        const startedAt = now();
        const found = useCatalogStore.getState().search(next, 8);
        setSearchMs(now() - startedAt);
        setHits(found);
      }, 0);
    },
    [],
  );

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const busiest = useMemo(
    () => week.reduce((peak, day) => Math.max(peak, day.totalLitres), 0),
    [week],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'Data lab' }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="title" tone="ink">
            Local data lab
          </Text>
          <Text variant="body" tone="inkSoft">
            SQLite, the bundled factor tables, and the real engine, end to end.
          </Text>

          {/* ------------------------------------------------------ today -- */}
          <Section title="Today">
            <View style={styles.heroRow}>
              <Text variant="hero" tone="ink" accessibilityLabel={`${litres(total?.totalLitres ?? 0)} litres today`}>
                {litres(total?.totalLitres ?? 0)}
              </Text>
              <Text variant="heroUnit" tone="inkSoft" style={styles.heroUnit}>
                L
              </Text>
            </View>
            <Row label="Day key" value={dayKey} />
            <Row label="Week key" value={weekKey} />
            <Row label="Entries in the total" value={String(total?.entryCount ?? 0)} />
            {Object.entries(total?.byCategory ?? {}).map(([category, value]) => (
              <Row key={category} label={category} value={`${litres(value)} L`} />
            ))}
          </Section>

          {/* ---------------------------------------------------- actions -- */}
          <Section title="Write path">
            <View style={styles.buttonRow}>
              <Button label="Add 3 sample entries" onPress={addSamples} busy={busy} />
              {lastRemoved ? (
                <Button label="Undo last removal" onPress={undo} tone="ink" />
              ) : null}
              <Button label="Empty the database" onPress={reset} tone="ink" busy={busy} />
              <Button label="Show the first run again" onPress={showOnboarding} tone="ink" />
            </View>
            <Text variant="body" tone="inkSoft" accessibilityLiveRegion="polite">
              {status}
            </Text>
          </Section>

          {/* --------------------------------------------------- entries --- */}
          <Section title={`Today's entries · ${today.length}`}>
            {today.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onDelete={remove} />
            ))}
            {today.length === 0 ? (
              <Text variant="body" tone="inkSoft">
                Today is empty. Add the samples above to fill it.
              </Text>
            ) : null}
          </Section>

          {/* ----------------------------------------------------- trends -- */}
          <Section title="Last 7 days">
            {week.map((day) => (
              <View key={day.localDay} style={styles.trendRow}>
                <Text variant="label" tone="inkSoft" style={styles.trendDay}>
                  {day.localDay.slice(5)}
                </Text>
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.trendBar,
                    {
                      backgroundColor: colors.accent,
                      width: busiest > 0 ? `${Math.max(2, (day.totalLitres / busiest) * 100)}%` : 2,
                    },
                  ]}
                />
                <Text variant="label" tone="ink" style={styles.trendValue}>
                  {litres(day.totalLitres)} L
                </Text>
              </View>
            ))}
          </Section>

          {/* ----------------------------------------------------- search -- */}
          <Section title="Catalog search">
            <TextInput
              value={query}
              onChangeText={onQuery}
              placeholder="Search the catalog"
              placeholderTextColor={colors.inkSoft}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search the catalog"
              style={[
                styles.input,
                { borderColor: colors.inkFaint, color: colors.ink, backgroundColor: colors.paper },
              ]}
            />
            <Row
              label="Scorer latency"
              value={`${searchMs.toFixed(2)} ms over ${catalogItems.length} items`}
            />
            <Row label="Normalised query" value={normalizeForSearch(query) || '—'} />
            {hits.map((hit) => (
              <View key={hit.item.id} style={styles.hitRow}>
                <View style={styles.hitText}>
                  <Text variant="label" tone="ink">
                    {hit.item.label}
                  </Text>
                  <Text variant="body" tone="inkSoft">
                    {hit.item.category} · {hit.item.defaultQuantity} {hit.item.defaultUnit}
                    {hit.item.typology ? ` · ${hit.item.typology}` : ''}
                  </Text>
                </View>
                <Text variant="label" tone="accent">
                  {Math.round(hit.score)}
                </Text>
              </View>
            ))}
          </Section>

          {/* ---------------------------------------------------- storage -- */}
          <Section title="Storage">
            <Row label="Journal mode" value={health.journal} />
            <Row label="Schema version" value={`user_version ${health.schema}`} />
            <Row label="Entries live" value={String(health.live)} />
            <Row label="Entries removed" value={String(health.deleted)} />
            <Row label="Catalog rows" value={String(health.catalogRows)} />
            <Row label="Catalog hydration" value={`${hydrationMs} ms · ${catalogStatus}`} />
            {catalogError ? <Row label="Catalog note" value={catalogError} /> : null}
          </Section>

          {/* ------------------------------------------------- persistence -- */}
          <Section title="Force-quit check">
            <Text variant="body" tone="inkSoft">
              Add the samples, then swipe Drop away from the recents list and open this
              screen again. WAL keeps the committed rows on disk, so the same day total,
              the same entries, and the same frozen snapshots come straight back.
            </Text>
          </Section>

          {/* ------------------------------------------------ factor tables -- */}
          <Section title="Bundled factors">
            <Row label="Version" value={FACTORS_VERSION} />
            {Object.entries(engineSizes).map(([table, size]) => (
              <Row key={table} label={table} value={`${size} rows`} />
            ))}
          </Section>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xxxl,
    gap: space.sm,
  },

  section: { marginTop: space.xl, gap: space.sm },
  sectionTitle: { marginBottom: space.xs },

  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  rowLabel: { flex: 1 },
  rowValue: { flexShrink: 0, textAlign: 'right' },

  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  heroUnit: { marginBottom: space.xs },

  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: 999,
  },

  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },

  card: { marginTop: space.sm },
  cardContent: { padding: space.lg, gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardHeadText: { flex: 1, gap: space.xs },
  cardFigure: { alignItems: 'flex-end' },
  cardAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },

  trendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  trendDay: { width: 46 },
  trendBar: { height: 10, borderRadius: 5, maxWidth: '55%' },
  trendValue: { flex: 1, textAlign: 'right' },

  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: space.lg,
    fontSize: 16,
  },

  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
  },
  hitText: { flex: 1 },
});

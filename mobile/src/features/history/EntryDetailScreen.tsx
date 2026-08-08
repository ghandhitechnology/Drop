/**
 * One record, exactly as it was written.
 *
 * Everything on this page is read out of `estimate_json` — the frozen snapshot
 * the engine produced at the moment the person said yes. The engine is never
 * called here and the factor tables are never consulted, so a later factors
 * release changes what tomorrow's captures say and leaves this page alone. The
 * version footer names the tables that actually produced the number.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { getEntry } from '../../data/entries';
import { isPlate } from '../../data/plate';
import type { Entry } from '../../data/types';
import { copy, formatLitres, heroFigure, litresSentence } from '../../lib/copy';
import { localDay } from '../../lib/time';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import { Snapshot } from '../capture/Snapshot';
import type { Estimate as CaptureEstimate } from '../capture/types';
import { ConfidenceChip } from '../result/ConfidenceChip';
import { DetailSection, HeadlineNotes } from '../result/DetailSection';
import { quantityText, recordedAt } from './format';
import { useHistoryStore } from './store';

/** The print, at the size it reads as a keepsake rather than a thumbnail. */
const PRINT = 184;

export function EntryDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ entryId: string }>();
  const entryId = params.entryId;

  const remove = useHistoryStore((s) => s.remove);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getEntry(entryId)
      .then((row) => {
        if (!active) return;
        setEntry(row && row.deleted_at === null ? row : null);
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [entryId]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/history');
  }, [router]);

  // The way back stays open on the record itself, which is where the person
  // lands the moment this returns.
  const handleRemove = useCallback(async () => {
    await remove(entryId);
    goBack();
  }, [remove, entryId, goBack]);

  const back = (
    <View style={styles.bar}>
      <Touch
        onPress={goBack}
        accessibilityLabel={copy.history.title}
        style={styles.back}
      >
        <Text variant="label" tone="accent">
          {copy.history.title}
        </Text>
      </Touch>
    </View>
  );

  if (!entry) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
        {back}
        {loaded && (
          <View style={styles.center}>
            <Text variant="body" tone="inkSoft">
              {copy.history.detail.missing}
            </Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  /*
   * The seam between the engine's own type and the capture feature's mirror of
   * it. `localPipeline` crosses it in the other direction on the way in; this
   * is the same one crossing on the way out, and it disappears when the two
   * share a single declaration.
   */
  const frozen = entry.estimate as unknown as CaptureEstimate;
  const hero = heroFigure(frozen);
  const amount = quantityText(entry.quantity_value, entry.quantity_unit);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      {back}

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="label" tone="inkSoft">
          {copy.history.detail.recorded(recordedAt(entry, localDay()))}
        </Text>

        <Text variant="title" tone="ink">
          {entry.item_label}
        </Text>

        {hero && (
          <View
            style={styles.figure}
            accessible
            accessibilityRole="text"
            accessibilityLabel={litresSentence(frozen)}
          >
            <Text
              variant="hero"
              tone="ink"
              numberOfLines={1}
              style={[styles.number, hero.range && styles.numberRange]}
            >
              {hero.value}
            </Text>
            <Text variant="heroUnit" tone="inkSoft" style={styles.unit}>
              {hero.unit}
            </Text>
          </View>
        )}

        <ConfidenceChip confidence={entry.confidence} />
        <HeadlineNotes estimate={frozen} />

        {/* A plate carries its cards inside the snapshot — list them. */}
        {isPlate(entry.estimate) && (
          <View style={[styles.items, { borderColor: colors.inkFaint }]}>
            <Text variant="label" tone="inkSoft">
              {copy.history.detail.onThePlate}
            </Text>
            {entry.estimate.plate.items.map((item, index) => (
              <View key={`${index}:${item.catalog_id}`} style={styles.itemRow}>
                <Text variant="body" tone="ink" numberOfLines={1} style={styles.itemName}>
                  {item.display_name}
                </Text>
                <Text variant="label" tone="inkSoft" style={styles.itemLitres}>
                  {item.headline
                    ? `${formatLitres(item.headline.value_l)} ${copy.result.unitShort}`
                    : copy.plate.arrivingLater}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.amount, { borderColor: colors.inkFaint }]}>
          <Text variant="label" tone="inkSoft">
            {copy.history.detail.amount}
          </Text>
          <Text variant="label" tone="ink" style={styles.amountValue}>
            {amount}
          </Text>
        </View>

        {/* The same print that stood over the result, kept with the record. */}
        {entry.photo_uri && (
          <Snapshot
            uri={entry.photo_uri}
            size={PRINT}
            seed={entry.id}
            label={copy.history.detail.photo}
            style={styles.print}
          />
        )}

        <DetailSection estimate={frozen} />

        <View style={[styles.footer, { borderTopColor: colors.inkFaint }]}>
          <Text variant="chip" tone="inkSoft">
            {copy.history.detail.factors(entry.factors_version)}
          </Text>
          <Text variant="chip" tone="inkSoft">
            {copy.history.detail.frozen}
          </Text>
        </View>

        <Touch
          onPress={handleRemove}
          accessibilityLabel={copy.history.detail.remove}
          accessibilityHint={copy.history.removeHint}
          style={[styles.remove, { borderColor: colors.inkFaint }]}
        >
          <Text variant="label" tone="inkSoft">
            {copy.history.detail.remove}
          </Text>
        </Touch>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { paddingHorizontal: space.lg, paddingTop: space.sm },
  back: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },

  figure: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  number: { fontVariant: ['tabular-nums'], flexShrink: 1 },
  // A range carries two figures and a dash, so it takes the smaller setting to
  // keep the unit beside it rather than pushed off the line.
  numberRange: { fontSize: 46, lineHeight: 54 },
  unit: { paddingBottom: space.xs },

  amount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  amountValue: { fontVariant: ['tabular-nums'] },

  items: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.md,
  },
  itemName: { flexShrink: 1 },
  itemLitres: { fontVariant: ['tabular-nums'] },

  print: { alignSelf: 'center', marginVertical: space.sm },

  footer: { borderTopWidth: 1, paddingTop: space.md, gap: space.xs },
  remove: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

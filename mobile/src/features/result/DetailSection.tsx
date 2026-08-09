/**
 * What went into the number, and where it came from.
 *
 * Collapsed by default: the hero figure answers the question, and this answers
 * the next one. Assumptions come first because they are about *this* estimate;
 * the source block follows with tabular figures, because it is a record rather
 * than a sentence.
 */

import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../design/theme';
import { space } from '../../design/tokens';
import {
  assumptionLines,
  copy,
  fallbackLine,
  formatLitres,
  metricLabel,
  sourceRows,
} from '../../lib/copy';
import { Text } from '../../ui/Text';
import type { Estimate } from '../capture/types';

export type DetailSectionProps = {
  estimate: Estimate;
};

export function DetailSection({ estimate }: DetailSectionProps) {
  const { colors } = useTheme();
  const lines = assumptionLines(estimate);
  const rows = sourceRows(estimate);

  return (
    <View style={styles.root}>
      {lines.length > 0 && (
        <View style={styles.block}>
          <Text variant="label" tone="inkSoft">
            {copy.result.assumptionsTitle}
          </Text>
          {lines.map((line) => (
            <View key={line} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: colors.inkFaint }]} />
              <Text variant="body" tone="inkSoft" style={styles.bulletText}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      )}

      {estimate.secondary.length > 0 && (
        <View style={styles.block}>
          {estimate.secondary.map((metric) => (
            <Text key={metric.factor.factor_id} variant="body" tone="inkSoft">
              {copy.result.secondaryLine(
                metric.label,
                `${formatLitres(metric.value_l)} ${copy.result.unitShort}`,
              )}
            </Text>
          ))}
        </View>
      )}

      <View style={[styles.block, styles.source, { borderTopColor: colors.inkFaint }]}>
        <Text variant="label" tone="inkSoft">
          {copy.result.sourceTitle}
        </Text>
        {rows.map((row) => (
          <View key={row.label} style={styles.sourceRow}>
            <Text variant="label" tone="inkSoft" style={styles.sourceLabel}>
              {row.label}
            </Text>
            <Text variant="label" tone="ink" style={styles.sourceValue}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The two lines that qualify the headline, shown whether or not the detail is
 * open — the metric and the match route change what the number *means*, so
 * they stay beside it rather than waiting behind a toggle.
 *
 * The metric line appears whenever the headline is measuring something other
 * than a total water footprint: a proxy stands in for it, and a bus trip is
 * counted as freshwater consumption. Both are figures a person would read
 * differently if they knew, so both say so.
 */
export function HeadlineNotes({ estimate }: DetailSectionProps) {
  const headline = estimate.headline;
  const fallback = fallbackLine(estimate.fallback_reason);
  const named =
    headline &&
    (headline.proxy_metric || headline.metric_type !== 'total_water_footprint');
  const metric = headline ? metricLabel(headline.metric_type) : null;

  if (!named && !fallback) return null;

  return (
    <View style={styles.notes}>
      {named && metric && (
        <Text variant="label" tone="inkSoft">
          {copy.result.metricLine(metric)}
        </Text>
      )}
      {fallback && (
        <Text variant="label" tone="inkSoft">
          {fallback}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  block: { gap: space.sm },
  notes: { gap: space.xs },
  bulletRow: { flexDirection: 'row', gap: space.sm },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 9 },
  bulletText: { flex: 1 },
  source: { borderTopWidth: 1, paddingTop: space.md },
  sourceRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  sourceLabel: { width: 96 },
  sourceValue: { flex: 1, fontVariant: ['tabular-nums'] },
});

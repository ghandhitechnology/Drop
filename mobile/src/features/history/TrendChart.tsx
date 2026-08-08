/**
 * Seven or thirty days, drawn in crayon.
 *
 * Two canvases and no more: the guides sit still on the lower one, the bars sit
 * on the upper one, and the growing-in is a transform on the *view* that holds
 * the upper canvas rather than a transform inside it. That distinction is the
 * whole performance story here — a Skia transform would re-run the jitter path
 * effect on every one of ~90 strokes each frame, while a view transform is a
 * texture the GPU already has.
 *
 * The canvases are decoration and are hidden from the screen reader. Meaning is
 * carried by a transparent hit area per bar, each labelled "Tuesday, 4,200
 * litres", and by the plain summary line printed underneath.
 */

import { Canvas, Path, Skia, rect, rrect } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../design/theme';
import { radius as radii, space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy, formatLitres } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { Text } from '../../ui/Text';
import type { DailyTotal } from '../../data/types';
import { layoutChart, type ChartBar } from './chart';
import { barDayName, litresSpoken, shortDate, weekdayShort } from './format';
import type { ChartRange } from './store';

/** Height of the plot itself, guides included, axis labels excluded. */
const PLOT_HEIGHT = 132;
/** Room on the left for the three axis figures. */
const GUTTER = 46;
/** Above this many bars the chart switches to its denser drawing. */
const DENSE_ABOVE = 10;
const BAR_RADIUS = 3;

export type TrendChartProps = {
  days: DailyTotal[];
  range: ChartRange;
  todayKey: string;
  onRange: (range: ChartRange) => void;
};

export function TrendChart({ days, range, todayKey, onRange }: TrendChartProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const [width, setWidth] = useState(0);

  const dense = days.length > DENSE_ABOVE;
  const layout = useMemo(
    () => layoutChart(days, width, PLOT_HEIGHT),
    [days, width],
  );

  /* The bars grow up from the baseline, once per window. */
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: motion.ms('draw') || 1 });
  }, [grow, motion, range, width]);

  const growStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: grow.value }],
  }));

  const guides = useMemo(
    () => layout.ticks.map((tick) => guideAt(tick.y, width)),
    [layout.ticks, width],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
  };

  const span = range === 7 ? copy.history.spanWeek : copy.history.spanMonth;
  const summary = layout.peak
    ? [
        copy.history.summaryTotal(span, litresSpoken(layout.total)),
        copy.history.summaryDaily(litresSpoken(layout.average)),
        copy.history.summaryPeak(
          barDayName(layout.peak.day, todayKey, dense),
          litresSpoken(layout.peak.litres),
        ),
      ].join(' · ')
    : copy.history.summaryQuiet(span);

  return (
    <View style={styles.root}>
      <RangeToggle range={range} onRange={onRange} />

      <View style={styles.chartRow}>
        <View style={styles.gutter} accessible={false} importantForAccessibility="no-hide-descendants">
          {layout.ticks.map((tick) => (
            <Text
              key={tick.value}
              variant="chip"
              tone="inkSoft"
              style={[styles.tickLabel, { top: tick.y - 9 }]}
              numberOfLines={1}
            >
              {formatLitres(tick.value)}
            </Text>
          ))}
        </View>

        <View style={styles.plot} onLayout={onLayout}>
          {width > 0 && (
            <>
              <Canvas
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                {layout.ticks.map((tick, index) => (
                  <HandPath
                    key={tick.value}
                    path={guides[index]}
                    color={colors.inkFaint}
                    variant="pencil"
                    seed={seedFromString(`history/guide/${index}`)}
                    strokeScale={index === layout.ticks.length - 1 ? 0.8 : 0.5}
                  />
                ))}
              </Canvas>

              <Animated.View
                style={[StyleSheet.absoluteFill, styles.growth, growStyle]}
                pointerEvents="none"
              >
                <Canvas
                  style={StyleSheet.absoluteFill}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
                  {layout.bars.map((bar) => (
                    <Bar
                      key={bar.day}
                      bar={bar}
                      dense={dense}
                      today={bar.day === todayKey}
                      ink={colors.ink}
                      accent={colors.accent}
                    />
                  ))}
                </Canvas>
              </Animated.View>
            </>
          )}

          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {layout.bars.map((bar) => (
              <View
                key={bar.day}
                accessible
                accessibilityRole="text"
                accessibilityLabel={copy.history.bar(
                  barDayName(bar.day, todayKey, dense),
                  litresSpoken(bar.litres),
                )}
                style={[styles.hit, { left: bar.cellX, width: bar.cellWidth }]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.axisRow}>
        <View style={styles.gutter} />
        <View style={styles.axis} accessible={false} importantForAccessibility="no-hide-descendants">
          {dense ? (
            <View style={styles.axisEnds}>
              <Text variant="chip" tone="inkSoft">
                {days.length > 0 ? shortDate(days[0].localDay) : ''}
              </Text>
              <Text variant="chip" tone="inkSoft">
                {copy.history.today}
              </Text>
            </View>
          ) : (
            layout.bars.map((bar) => (
              <Text
                key={bar.day}
                variant="chip"
                tone={bar.day === todayKey ? 'accent' : 'inkSoft'}
                numberOfLines={1}
                style={[styles.axisLabel, { left: bar.cellX, width: bar.cellWidth }]}
              >
                {weekdayShort(bar.day)}
              </Text>
            ))
          )}
        </View>
      </View>

      <Text variant="label" tone="inkSoft">
        {summary}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ bar -- */

function Bar({
  bar,
  dense,
  today,
  ink,
  accent,
}: {
  bar: ChartBar;
  dense: boolean;
  today: boolean;
  ink: string;
  accent: string;
}) {
  const path = useMemo(() => {
    if (bar.height <= 0) return null;
    return Skia.Path.RRect(
      rrect(rect(bar.x, bar.y, bar.width, bar.height), BAR_RADIUS, BAR_RADIUS),
    );
  }, [bar.x, bar.y, bar.width, bar.height]);

  if (!path) return null;
  const stroke = today ? accent : ink;

  return (
    <>
      <Path path={path} style="fill" color={stroke} opacity={today ? 0.28 : 0.2} />
      <HandPath
        path={path}
        color={stroke}
        variant={dense ? 'pencil' : 'crayon'}
        seed={seedFromString(`history/bar/${bar.day}`)}
        strokeScale={dense ? 0.55 : 0.85}
      />
    </>
  );
}

function guideAt(y: number, width: number) {
  return Skia.PathBuilder.Make().moveTo(0, y).lineTo(width, y).detach();
}

/* --------------------------------------------------------------- toggle -- */

/**
 * The chosen range is coloured in and pressed harder; the other is a thin
 * outline. Weight carries the selection, so it survives being read in grey.
 */
function RangeToggle({
  range,
  onRange,
}: {
  range: ChartRange;
  onRange: (range: ChartRange) => void;
}) {
  const options: { value: ChartRange; label: string }[] = [
    { value: 7, label: copy.history.range.week },
    { value: 30, label: copy.history.range.month },
  ];

  return (
    <View style={styles.toggle}>
      {options.map((option) => {
        const selected = option.value === range;
        return (
          <SketchButton
            key={option.value}
            onPress={() => onRange(option.value)}
            seed={`history/range/${option.value}`}
            tone={selected ? 'accent' : 'quiet'}
            filled={selected}
            radius={radii.pill}
            scale={selected ? 0.9 : 0.68}
            accessibilityLabel={option.label}
            accessibilityHint={copy.history.rangeHint}
            accessibilityState={{ selected }}
            style={styles.toggleOption}
            contentStyle={styles.toggleContent}
          >
            <Text variant="chip" tone={selected ? 'accent' : 'inkSoft'}>
              {option.label}
            </Text>
          </SketchButton>
        );
      })}
    </View>
  );
}

/* ---------------------------------------------------------------- styles -- */

const styles = StyleSheet.create({
  root: { gap: space.md },

  toggle: { flexDirection: 'row', gap: space.sm },
  toggleOption: { minHeight: 40 },
  toggleContent: { minHeight: 40, paddingHorizontal: space.lg },

  chartRow: { flexDirection: 'row', height: PLOT_HEIGHT },
  gutter: { width: GUTTER },
  tickLabel: { position: 'absolute', right: space.sm, textAlign: 'right' },
  plot: { flex: 1 },
  // The bars are anchored to the baseline so growth reads as filling upward.
  growth: { transformOrigin: 'bottom' },
  hit: { position: 'absolute', top: 0, bottom: 0 },

  axisRow: { flexDirection: 'row', marginTop: space.xs },
  axis: { flex: 1, height: 18 },
  axisLabel: { position: 'absolute', top: 0, textAlign: 'center' },
  axisEnds: { flexDirection: 'row', justifyContent: 'space-between' },
});

export { PLOT_HEIGHT };

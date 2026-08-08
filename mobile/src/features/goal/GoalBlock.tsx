/**
 * The mark, under today's figure.
 *
 * Three lines and a drawing: the week against the mark, the bar, and what the
 * bar leaves unsaid. It sits inside the record rather than on a screen of its
 * own — the mark is context for the figure above it, and a person who has to
 * navigate somewhere to see whether they are inside it will not look.
 *
 * The week is the unit even though the figure above is a day. One beef entry
 * is several thousand litres, so a daily mark reports which day held the beef.
 * The chart below keeps the per-day shape, so nothing is drawn twice.
 *
 * Before a mark exists this is an invitation instead, and nothing about the
 * invitation implies a number is owed.
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../design/tokens';
import { copy, formatLitres } from '../../lib/copy';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import { litresShort, litresSpoken } from '../history/format';
import { GoalBar } from './GoalBar';
import { DriverNote } from './DriverNote';
import { progressFor } from './goal';
import { useGoalStore } from './store';
import { driverOf, type WeekDriver } from './suggest';

export function GoalBlock() {
  const router = useRouter();
  const status = useGoalStore((s) => s.status);
  const goal = useGoalStore((s) => s.goal);
  const leaders = useGoalStore((s) => s.leaders);
  const week = useGoalStore((s) => s.week);
  const dayOfWeek = useGoalStore((s) => s.dayOfWeek);

  /**
   * Derived here rather than in a selector. `progressFor` builds a fresh object
   * every call, and a zustand selector that never returns the same reference
   * twice re-renders on every store read — so the store hands over the three
   * figures and the object is made once, here.
   */
  const weekLitres = week?.totalLitres ?? null;
  const progress = useMemo(
    () =>
      goal === null || weekLitres === null
        ? null
        : progressFor(weekLitres, goal, dayOfWeek),
    [weekLitres, goal, dayOfWeek],
  );

  const open = () => router.push('/goal');

  if (status !== 'ready') return null;
  if (goal === null || !progress) return <Invitation onPress={open} />;

  const spent = formatLitres(progress.spent);
  const mark = `${formatLitres(progress.goal)} ${copy.result.unitShort}`;
  const days = copy.goal.daysLeft(progress.daysLeft);

  /* Left of the bar is time, right of it is distance. Both stay quiet while
     the week is comfortably inside the mark — there is nothing to report. */
  const trailing =
    progress.status === 'over'
      ? copy.goal.over(litresShort(progress.over))
      : progress.status === 'near'
        ? copy.goal.toMark(litresShort(progress.remaining))
        : '';

  return (
    <View style={styles.root}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={[
          copy.goal.spoken(
            litresSpoken(progress.spent),
            litresSpoken(progress.goal),
            days,
          ),
          trailing,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <View style={styles.heading}>
          <Text variant="label" tone="inkSoft">
            {copy.goal.span}
          </Text>
          <Text variant="count" tone="ink" style={styles.count}>
            {copy.goal.count(spent, mark)}
          </Text>
        </View>

        <GoalBar progress={progress} />

        <View style={styles.foot}>
          <Text variant="axis" tone="inkSoft">
            {days}
          </Text>
          {trailing !== '' && (
            <Text
              variant="axis"
              tone={progress.status === 'over' ? 'ink' : 'inkSoft'}
            >
              {trailing}
            </Text>
          )}
        </View>
      </View>

      {progress.status === 'over' && (
        <Driver leaders={leaders} weekLitres={week?.totalLitres ?? 0} />
      )}

      <SketchLink
        onPress={open}
        seed="goal/edit"
        accessibilityLabel={copy.goal.edit}
        accessibilityHint={copy.goal.editHint}
        style={styles.edit}
      >
        {copy.goal.edit}
      </SketchLink>
    </View>
  );
}

/* --------------------------------------------------------------- driver -- */

/**
 * Finding the lighter alternative runs the engine over the comparable part of
 * the catalogue, so it happens off the render pass and lands when it lands.
 * The block above it is already correct and complete without this.
 */
function Driver({ leaders, weekLitres }: { leaders: WeekDriver['leader'][]; weekLitres: number }) {
  const [driver, setDriver] = useState<WeekDriver | null>(null);

  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      const found = driverOf(leaders, weekLitres);
      if (live) setDriver(found);
    }, 0);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [leaders, weekLitres]);

  return driver ? <DriverNote driver={driver} /> : null;
}

/* ----------------------------------------------------------- invitation -- */

function Invitation({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.invite}>
      <Text variant="label" tone="ink">
        {copy.goal.invite.title}
      </Text>
      <Text variant="axis" tone="inkSoft">
        {copy.goal.invite.body}
      </Text>
      <SketchLink
        onPress={onPress}
        seed="goal/invite"
        accessibilityLabel={copy.goal.invite.action}
        style={styles.edit}
      >
        {copy.goal.invite.action}
      </SketchLink>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  count: { fontVariant: ['tabular-nums'] },
  foot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  invite: { gap: space.xs },
  edit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});

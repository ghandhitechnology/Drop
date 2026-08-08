import { Canvas, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { useTheme } from '../../design/theme';
import { HandFrame } from '../../drawing/HandFrame';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy, formatQuantity } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import type { Estimate } from '../capture/types';
import type { SearchPick } from './pick';

export type BasketTrayProps = {
  items: readonly SearchPick[];
  onRemove: (index: number) => void;
};

/** A visible, horizontally scrollable record of everything staged so far. */
export function BasketTray({ items, onRemove }: BasketTrayProps) {
  const motion = useMotion();
  const scrollRef = useRef<ScrollView>(null);
  const previousCount = useRef(0);

  useEffect(() => {
    const added = items.length > previousCount.current;
    previousCount.current = items.length;
    if (!added) return;

    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: !motion.reduceMotion });
    });
    return () => cancelAnimationFrame(frame);
  }, [items.length, motion.reduceMotion]);

  if (items.length === 0) return null;

  return (
    <View style={styles.tray} accessibilityLabel={copy.search.basketLabel(items.length)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        decelerationRate="fast"
        contentContainerStyle={styles.content}
      >
        {items.map((item, index) => (
          <BasketPill
            key={`${item.catalogId}/${index}`}
            item={item}
            index={index}
            onRemove={onRemove}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function BasketPill({
  item,
  index,
  onRemove,
}: {
  item: SearchPick;
  index: number;
  onRemove: (index: number) => void;
}) {
  const { colors } = useTheme();
  const seed = useMemo(
    () => seedFromString(`search/basket/${item.catalogId}/${index}`),
    [item.catalogId, index],
  );
  const removeMark = useMemo(
    () =>
      Skia.PathBuilder.Make()
        .moveTo(4, 4)
        .lineTo(14, 14)
        .moveTo(14, 4)
        .lineTo(4, 14)
        .detach(),
    [],
  );
  const amount = formatQuantity(
    item.quantity.value,
    item.quantity.unit as Estimate['quantity']['unit'],
  );

  return (
    <Touch
      onPress={() => onRemove(index)}
      style={styles.pill}
      accessibilityLabel={copy.search.removePick(item.displayName)}
      accessibilityHint={copy.search.removePickHint}
    >
      <HandFrame
        seed={seed}
        variant="crayon"
        color={colors.accent}
        radius={24}
        strokeScale={0.72}
        style={styles.pillFrame}
        contentStyle={styles.pillContent}
      >
        <View style={[styles.pillWash, { backgroundColor: colors.accentSoft }]} />
        <Text variant="label" tone="accent" numberOfLines={1} style={styles.name}>
          {item.displayName}
        </Text>
        <Text variant="chip" tone="accent">
          {amount}
        </Text>
        <Canvas style={styles.removeMark} pointerEvents="none">
          <HandPath
            path={removeMark}
            color={colors.accent}
            variant="pencil"
            seed={seed + 7}
            strokeScale={0.75}
          />
        </Canvas>
      </HandFrame>
    </Touch>
  );
}

const styles = StyleSheet.create({
  tray: { minHeight: 56, marginTop: space.sm },
  content: {
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  pill: { minHeight: 48, maxWidth: 248 },
  pillFrame: { minHeight: 48 },
  pillContent: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.md,
  },
  pillWash: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 18,
  },
  name: { flexShrink: 1 },
  removeMark: { width: 18, height: 18 },
});

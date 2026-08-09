/**
 * The standing hint under the frame.
 *
 * This is Drop talking, so it is written rather than labelled: the note face,
 * hand-lettered, with a stroke pulled under it the way someone underlines a
 * word they mean. It carries no plate at all — a pill here was the one element
 * on the viewfinder that read as an interface rather than as a drawing.
 *
 * Legibility over live video comes from an ink halo under the glyphs and under
 * the stroke, which holds on a white wall and on a dark aisle without ever
 * blocking out the frame the person is composing.
 */

import { Canvas, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { useMotion } from '../../design/useMotion';

import { space } from '../../design/tokens';
import { HandPath } from '../../drawing/HandPath';
import { mulberry32, seedFromString } from '../../drawing/seededRandom';
import { Text } from '../../ui/Text';
import { useOverlayInk } from './overlay';

const SEED = seedFromString('capture/framing-note');
/** Height reserved under the words for the stroke. */
const RULE_HEIGHT = 12;
/** How far short of the words each end of the stroke stops. */
const RULE_INSET = 10;

export type FramingNoteProps = { children: string };

function FramingNoteLayer({ children }: FramingNoteProps) {
  const overlayInk = useOverlayInk();
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  };

  // A single stroke with a shallow sag in the middle, the way a hand pulls one
  // in one movement. The sag and the end heights come from the seed, so it is
  // always this note's underline and never a straight ruled line.
  const rule = useMemo(() => {
    if (width <= RULE_INSET * 2) return null;
    const random = mulberry32(SEED);
    const left = RULE_INSET;
    const right = width - RULE_INSET;
    const mid = (left + right) / 2;
    const base = RULE_HEIGHT / 2;
    const path = Skia.Path.Make();
    path.moveTo(left, base - 1 + random() * 2);
    path.quadTo(mid, base + 2.5 + random() * 1.5, right, base - 2 + random() * 2);
    return path;
  }, [width]);

  return (
    <>
      {/*
        The stroke is measured from the words, and the words alone: measuring
        the container instead would make the stroke's own width part of what
        the container measures, and the two would push each other wider frame
        after frame.
      */}
      <Text
        variant="note"
        tone={overlayInk.mark}
        style={[styles.words, { textShadowColor: overlayInk.halo }]}
        numberOfLines={2}
        onLayout={onLayout}
      >
        {children}
      </Text>

      {rule && (
        <Canvas
          style={[styles.rule, { width }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {/* The same stroke in ink, laid wide underneath: the stroke's own
              halo, so a white line survives a white wall. */}
          <HandPath
            path={rule}
            color={overlayInk.halo}
            variant="crayon"
            seed={SEED}
            strokeScale={2.1}
          />
          <HandPath
            path={rule}
            color={overlayInk.mark}
            variant="crayon"
            seed={SEED}
            strokeScale={0.8}
          />
        </Canvas>
      )}
    </>
  );
}

export function FramingNote({ children }: FramingNoteProps) {
  const motion = useMotion();
  const transitionMs = Math.max(1, motion.ms('settle'));
  const [height, setHeight] = useState(0);

  // The outgoing note stays mounted for the length of its exit, so both layers
  // are on screen at once. They are stacked rather than laid out in sequence,
  // and the container holds the height it last measured: otherwise the swap
  // would briefly make the note twice as tall and shove the shutter down.
  // Grow-only, so a note that wraps to two lines at a large text size reserves
  // the room it needs rather than being pinned to what the first note measured.
  const onLayer = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setHeight((current) => (next > current ? next : current));
  };

  return (
    <View style={[styles.root, height > 0 && { height }]} pointerEvents="none">
      <Animated.View
        key={children}
        style={[styles.layer, height > 0 && styles.stacked]}
        onLayout={onLayer}
        entering={FadeInDown.duration(transitionMs)}
        exiting={FadeOutUp.duration(transitionMs)}
      >
        <FramingNoteLayer>{children}</FramingNoteLayer>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Stretched rather than content-sized, so the note's own width never depends
  // on what is drawn inside it.
  root: { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: space.xl },
  layer: { alignItems: 'center' },
  // Top-anchored rather than filled, so the layer still measures its own height.
  stacked: { position: 'absolute', top: 0, left: 0, right: 0 },
  words: {
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 7,
  },
  rule: { height: RULE_HEIGHT },
});

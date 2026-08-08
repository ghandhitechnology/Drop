/**
 * The first run: two screens, then the camera.
 *
 * The first makes the promise. The second asks for the camera, in the
 * character's own voice, as the character asking to see — the OS dialog is a
 * yes/no box about a permission, and this is the sentence that makes the yes
 * make sense.
 *
 * Three things it refuses to do. It never traps: the way out is on screen from
 * the first frame, the system Back gesture works, and every exit — finished,
 * skipped, declined — writes the flag and lands on the camera. It never
 * teaches: there is no tour, no tooltip, no list of features, because the
 * product's whole first value is one photo away. And it never repeats: the flag
 * is written on the way out of any door.
 *
 * One shared value per screen draws that screen's marks; a second brings its
 * words up behind them. Under reduced motion both start at their end and the
 * page is simply there.
 */
import { useCameraPermissions } from 'expo-camera';
import { Canvas, Skia } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../design/theme';
import { MIN_TOUCH_SIZE, radius, space } from '../../design/tokens';
import { useMotion } from '../../design/useMotion';
import { Grain } from '../../drawing/grain';
import { HandPath } from '../../drawing/HandPath';
import { seedFromString } from '../../drawing/seededRandom';
import { copy } from '../../lib/copy';
import { tapSelection } from '../../lib/haptics';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import { useFirstRun } from './firstRun';
import { RisingWater, Viewfinder } from './OnboardingScene';

const STEPS = 2;

/** How long the whole drawing takes, and how far behind it the words arrive. */
const DRAW_MS = 980;
const WORDS_DELAY_MS = 320;
const WORDS_MS = 300;

/** Scene size, as a share of the smaller screen edge, and its ceiling. */
const SCENE_SHARE = 0.78;
const SCENE_MAX = 320;

export type OnboardingFlowProps = {
  /** Where to go once the flow is done with. */
  onDone: () => void;
};

export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const { colors } = useTheme();
  const motion = useMotion();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const complete = useFirstRun((s) => s.complete);

  const [step, setStep] = useState(0);
  const leaving = useRef(false);

  const scene = Math.min(
    SCENE_MAX,
    Math.round(Math.min(width, height * 0.52) * SCENE_SHARE),
  );

  /* ------------------------------------------------------------ motion */

  const draw = useSharedValue(0);
  const words = useSharedValue(0);

  useEffect(() => {
    if (motion.reduceMotion) {
      draw.value = 1;
      words.value = 1;
      return;
    }
    draw.value = 0;
    words.value = 0;
    draw.value = withTiming(1, {
      duration: DRAW_MS,
      easing: Easing.out(Easing.cubic),
    });
    words.value = withDelay(
      WORDS_DELAY_MS,
      withTiming(1, { duration: WORDS_MS, easing: Easing.out(Easing.quad) }),
    );
  }, [step, motion.reduceMotion, draw, words]);

  const wordsStyle = useAnimatedStyle(() => ({
    opacity: words.value,
    transform: [{ translateY: (1 - words.value) * 12 }],
  }));

  /* ------------------------------------------------------------- doors */

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    complete();
    onDone();
  }, [complete, onDone]);

  const next = useCallback(() => {
    tapSelection();
    setStep(1);
  }, []);

  const back = useCallback(() => {
    tapSelection();
    setStep(0);
  }, []);

  const askForCamera = useCallback(async () => {
    tapSelection();
    // The answer is not a gate. Granted, the camera is live when the person
    // arrives; declined, the camera screen offers the way to Settings. Either
    // way the next thing they see is the viewfinder.
    if (permission?.canAskAgain !== false) await requestPermission();
    AccessibilityInfo.announceForAccessibility(copy.onboarding.announce.done);
    leave();
  }, [permission?.canAskAgain, requestPermission, leave]);

  // System Back steps back through the flow, then leaves it. Trapping the
  // gesture here would be the first thing the product ever did to someone.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) {
        back();
        return true;
      }
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [step, back, leave]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      step === 0 ? copy.onboarding.announce.promise : copy.onboarding.announce.camera,
    );
  }, [step]);

  /* -------------------------------------------------------------- words */

  const page = step === 0 ? copy.onboarding.promise : copy.onboarding.camera;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Grain />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <StepMarks step={step} />
          {/*
            Skip belongs to the promise screen. On the ask, the decline sits
            under the primary action instead — one screen, one way to say no,
            and it is next to the decision being made.
          */}
          {step === 0 && (
            <SketchLink
              onPress={leave}
              seed="onboarding/skip"
              tone="inkSoft"
              style={styles.skip}
              accessibilityLabel={copy.onboarding.skip}
              accessibilityHint={copy.onboarding.skipHint}
            >
              {copy.onboarding.skip}
            </SketchLink>
          )}
        </View>

        {/*
          The drawing and the words are one block, centred together. Letting the
          drawing take the leftover height on its own opened a gap under it that
          read as two unrelated screens stacked on one page.
        */}
        <View style={styles.stage}>
          {step === 0 ? (
            <RisingWater size={scene} progress={draw} />
          ) : (
            <Viewfinder size={scene} progress={draw} />
          )}

          <Animated.View style={[styles.words, wordsStyle]}>
            <Text variant="title" tone="ink" style={styles.title}>
              {page.title}
            </Text>
            <Text variant="body" tone="inkSoft" style={styles.body}>
              {page.body}
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.actions, wordsStyle]}>
          {/*
            One seed per step, so the promise and the ask are drawn as two
            different boxes rather than the same box twice — which is what the
            page turn would otherwise look like with the label swapped.
          */}
          <SketchButton
            onPress={step === 0 ? next : askForCamera}
            seed={`onboarding/primary/${step}`}
            filled
            radius={radius.pill}
            style={styles.primary}
            contentStyle={styles.primaryContent}
            accessibilityLabel={page.action}
            accessibilityHint={page.actionHint}
          >
            <Text variant="label" tone="accent">
              {page.action}
            </Text>
          </SketchButton>

          {step === 1 && (
            <SketchLink
              onPress={leave}
              seed="onboarding/later"
              tone="inkSoft"
              style={styles.secondary}
              accessibilityLabel={copy.onboarding.camera.later}
              accessibilityHint={copy.onboarding.camera.laterHint}
            >
              {copy.onboarding.camera.later}
            </SketchLink>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

/* --------------------------------------------------------- the step marks */

// Longer than they look like they need to be. `HandPath`'s jitter is a fixed
// deviation in path space, so on an 18dp dash it was a third of the length and
// the mark read as a squiggle rather than a ruled line.
const DASH_LONG = 28;
const DASH_SHORT = 11;
const DASH_GAP = 7;
const DASH_BOX = { width: DASH_LONG * 2 + DASH_GAP, height: 10 };

/**
 * Two dashes and a count.
 *
 * The dashes are the page number of a sketchbook; the count beside them is a
 * real Text, so the position in the flow is available to someone who never
 * sees the marks.
 */
function StepMarks({ step }: { step: number }) {
  const { colors } = useTheme();

  const marks = useMemo(() => {
    const y = DASH_BOX.height / 2;
    const build = (x: number, length: number) =>
      Skia.PathBuilder.Make().moveTo(x, y).lineTo(x + length, y).detach();
    return [
      build(0, step === 0 ? DASH_LONG : DASH_SHORT),
      build(DASH_LONG + DASH_GAP, step === 1 ? DASH_LONG : DASH_SHORT),
    ];
  }, [step]);

  return (
    <View style={styles.steps}>
      <Canvas
        style={DASH_BOX}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {marks.map((path, index) => (
          <HandPath
            key={index}
            path={path}
            color={index === step ? colors.accent : colors.inkFaint}
            // Pencil, not crayon: crayon's 2.6px deviation across an 18px dash
            // wobbles it into a squiggle rather than a ruled mark.
            variant="pencil"
            seed={seedFromString(`onboarding/step-${index}`)}
            strokeScale={1}
          />
        ))}
      </Canvas>
      <Text
        variant="chip"
        tone="inkSoft"
        accessibilityLabel={copy.onboarding.step(String(step + 1), String(STEPS))}
      >
        {copy.onboarding.stepShort(String(step + 1), String(STEPS))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    minHeight: 48,
  },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // Drawn at the full 48dp rather than leaning on `Touch`'s hitSlop to make up
  // the difference. The slop is a safety net for marks that are genuinely small;
  // a text button has no reason to need it.
  skip: {
    minHeight: MIN_TOUCH_SIZE,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },

  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
  },

  words: { alignSelf: 'stretch', paddingHorizontal: space.xl, gap: space.sm },
  title: { maxWidth: 420 },
  body: { maxWidth: 420 },

  actions: {
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  primary: { minHeight: 58 },
  primaryContent: { minHeight: 58 },
  secondary: { minHeight: 48, alignItems: 'center' },
});

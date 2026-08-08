/**
 * The first run: three screens, then the camera.
 *
 * The first makes the promise. The second offers a weekly mark. The third asks
 * for the camera, in the character's own voice, as the character asking to
 * see — the OS dialog is a yes/no box about a permission, and this is the
 * sentence that makes the yes make sense. The ask stays last so that granting
 * it lands straight on the viewfinder.
 *
 * The mark screen is the one to be careful with, because on day one there is no
 * history to build a mark from and no defensible per-person water figure to
 * fall back on the way a calorie tracker falls back on maintenance calories.
 * So it offers two round numbers, says they are somewhere to start, keeps
 * "Decide later" beside them at equal weight, and promises a real one once
 * there are weeks to compute it from. It never sets a mark by default: a target
 * nobody chose is one nobody owns.
 *
 * Three things the flow refuses to do. It never traps: the way out is on screen
 * from the first frame, the system Back gesture works, and every exit —
 * finished, skipped, declined — writes the flag and lands on the camera. It
 * never teaches: there is no tour, no tooltip, no list of features, because the
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
import { copy, formatLitres } from '../../lib/copy';
import { tapSelection } from '../../lib/haptics';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import { litresSpoken } from '../history/format';
import { OPENING_GOAL_LITRES, useGoalStore } from '../goal';
import { useFirstRun } from './firstRun';
import { RisingWater, Viewfinder, WeekMark } from './OnboardingScene';

const STEPS = 3;

/** Which screen is which. The camera ask stays last, so a yes lands on it. */
const PROMISE = 0;
const MARK = 1;
const CAMERA = 2;

/**
 * The two round marks offered on day one.
 *
 * Round on purpose. Neither is derived from anything about this person, and
 * the copy beside them says so; a number carried to the last hundred would
 * claim a precision that does not exist yet.
 */
const OPENING_MARKS = [
  { key: 'steady', litres: OPENING_GOAL_LITRES },
  { key: 'lighter', litres: 11_000 },
] as const;

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
  const setGoal = useGoalStore((s) => s.setGoal);

  const [step, setStep] = useState(PROMISE);
  /** Which opening mark is under the thumb. Nothing is chosen by default. */
  const [chosen, setChosen] = useState<string | null>(null);
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
    setStep((current) => Math.min(STEPS - 1, current + 1));
  }, []);

  const back = useCallback(() => {
    tapSelection();
    setStep((current) => Math.max(PROMISE, current - 1));
  }, []);

  const pick = useCallback((key: string) => {
    tapSelection();
    // A second press on the chosen mark lets it go, so the thumb can get back
    // to having chosen nothing without reaching for "Decide later".
    setChosen((current) => (current === key ? null : key));
  }, []);

  /**
   * Takes the mark and moves on, or just moves on.
   *
   * The write is awaited before the page turns so a person who force-quits on
   * the camera ask still has the mark they picked. It is one small key.
   */
  const takeMark = useCallback(async () => {
    const mark = OPENING_MARKS.find((option) => option.key === chosen);
    if (mark) {
      await setGoal(mark.litres);
      AccessibilityInfo.announceForAccessibility(
        copy.onboarding.announce.marked(litresSpoken(mark.litres)),
      );
    }
    next();
  }, [chosen, setGoal, next]);

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
      step === PROMISE
        ? copy.onboarding.announce.promise
        : step === MARK
          ? copy.onboarding.announce.mark
          : copy.onboarding.announce.camera,
    );
  }, [step]);

  /* -------------------------------------------------------------- words */

  const page =
    step === PROMISE
      ? copy.onboarding.promise
      : step === MARK
        ? copy.onboarding.mark
        : copy.onboarding.camera;

  /* The primary reads "Decide later" until a mark is under the thumb, so the
     screen is answerable in one press either way and the way past never hides
     behind a choice. */
  const markAction = chosen ? copy.onboarding.mark.action : copy.onboarding.mark.later;
  const markHint = chosen
    ? copy.onboarding.mark.actionHint
    : copy.onboarding.mark.laterHint;

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
          {step !== CAMERA && (
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
          {step === PROMISE ? (
            <RisingWater size={scene} progress={draw} />
          ) : step === MARK ? (
            <WeekMark size={scene} progress={draw} />
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

            {step === MARK && (
              <View style={styles.marks}>
                {OPENING_MARKS.map((option) => (
                  <MarkChoice
                    key={option.key}
                    option={option}
                    chosen={chosen === option.key}
                    onPress={pick}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        </View>

        <Animated.View style={[styles.actions, wordsStyle]}>
          {/*
            One seed per step, so the promise and the ask are drawn as two
            different boxes rather than the same box twice — which is what the
            page turn would otherwise look like with the label swapped.
          */}
          <SketchButton
            onPress={step === PROMISE ? next : step === MARK ? takeMark : askForCamera}
            seed={`onboarding/primary/${step}`}
            filled
            radius={radius.pill}
            style={styles.primary}
            contentStyle={styles.primaryContent}
            accessibilityLabel={step === MARK ? markAction : page.action}
            accessibilityHint={step === MARK ? markHint : page.actionHint}
          >
            <Text variant="label" tone="accent">
              {step === MARK ? markAction : page.action}
            </Text>
          </SketchButton>

          {step === MARK && (
            <Text variant="axis" tone="inkSoft" style={styles.note}>
              {copy.onboarding.mark.note}
            </Text>
          )}

          {step === CAMERA && (
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

/* ------------------------------------------------------------ one mark */

/**
 * One of the two opening marks.
 *
 * The two sit side by side at equal weight, and neither is pre-selected. A
 * default here would be a target the person never chose, which is the fastest
 * way to a mark nobody feels any ownership of.
 */
function MarkChoice({
  option,
  chosen,
  onPress,
}: {
  option: (typeof OPENING_MARKS)[number];
  chosen: boolean;
  onPress: (key: string) => void;
}) {
  const name =
    option.key === 'steady' ? copy.onboarding.mark.steady : copy.onboarding.mark.lighter;
  const body =
    option.key === 'steady'
      ? copy.onboarding.mark.steadyBody
      : copy.onboarding.mark.lighterBody;

  return (
    <SketchButton
      onPress={() => onPress(option.key)}
      seed={`onboarding/mark/${option.key}`}
      tone={chosen ? 'accent' : 'quiet'}
      filled={chosen}
      radius={radius.md}
      scale={chosen ? 0.9 : 0.68}
      accessibilityLabel={copy.onboarding.mark.choice(name, litresSpoken(option.litres))}
      accessibilityHint={body}
      accessibilityState={{ selected: chosen }}
      style={styles.mark}
      contentStyle={styles.markContent}
    >
      <Text variant="count" tone={chosen ? 'accent' : 'ink'}>
        {formatLitres(option.litres)}
      </Text>
      <Text variant="label" tone="ink">
        {name}
      </Text>
      <Text variant="axis" tone="inkSoft" style={styles.markBody}>
        {body}
      </Text>
    </SketchButton>
  );
}

/* --------------------------------------------------------- the step marks */

// Longer than they look like they need to be. `HandPath`'s jitter is a fixed
// deviation in path space, so on an 18dp dash it was a third of the length and
// the mark read as a squiggle rather than a ruled line.
const DASH_LONG = 28;
const DASH_SHORT = 11;
const DASH_GAP = 7;
const DASH_BOX = {
  width: DASH_LONG + (DASH_SHORT + DASH_GAP) * (STEPS - 1) + DASH_GAP,
  height: 10,
};

/**
 * One dash per screen, and a count.
 *
 * The dashes are the page number of a sketchbook; the count beside them is a
 * real Text, so the position in the flow is available to someone who never
 * sees the marks.
 *
 * Only the dash for the current screen is drawn long, so the row's width holds
 * still as the flow moves and the marks stay put under the eye.
 */
function StepMarks({ step }: { step: number }) {
  const { colors } = useTheme();

  const marks = useMemo(() => {
    const y = DASH_BOX.height / 2;
    return Array.from({ length: STEPS }, (_, index) => {
      // Every dash left of this one is short, save the current step's, which is
      // longer by exactly the difference between the two lengths.
      const x =
        index * (DASH_SHORT + DASH_GAP) + (step < index ? DASH_LONG - DASH_SHORT : 0);
      const length = index === step ? DASH_LONG : DASH_SHORT;
      return Skia.PathBuilder.Make().moveTo(x, y).lineTo(x + length, y).detach();
    });
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

  marks: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  mark: { flex: 1 },
  markContent: {
    minHeight: 96,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: 2,
    justifyContent: 'center',
  },
  markBody: { maxWidth: 160 },
  note: { textAlign: 'center', paddingHorizontal: space.md },

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

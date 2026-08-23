/**
 * Setting the mark.
 *
 * The hard part of this screen is that there is no defensible number to offer.
 * A calorie tracker can hand someone their maintenance calories; there is no
 * equivalent for a water footprint, and inventing one and presenting it as a
 * target would be exactly the false precision the product exists to avoid.
 *
 * So the marks offered come from the person's own logged weeks as soon as there
 * are two of them, and the number is theirs rather than ours. Before that the
 * field is blank and accepts an explicit number from the person.
 *
 * The stepper stays beside the field and history-derived presets. The typed
 * number or the thumb is always the last word.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePreferences } from '../../design/preferences';
import { useTheme } from '../../design/theme';
import { radius as radii, space } from '../../design/tokens';
import { maxFontSizeMultiplier, variantStyle } from '../../design/typography';
import { copy, formatLitres } from '../../lib/copy';
import { tapSelection } from '../../lib/haptics';
import { SketchButton } from '../../ui/SketchButton';
import { SketchLink } from '../../ui/SketchLink';
import { Text } from '../../ui/Text';
import { litresShort, litresSpoken } from '../history/format';
import {
  MIN_WEEKLY_LITRES,
  STEP_LITRES,
  clampGoal,
  initialGoalValue,
  parseGoalInput,
  suggestionsFrom,
} from './goal';
import { baselineOf, useGoalStore } from './store';

export function GoalScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const stored = useGoalStore((s) => s.goal);
  const history = useGoalStore((s) => s.history);
  const baseline = useGoalStore(baselineOf);
  const setGoal = useGoalStore((s) => s.setGoal);
  const clearGoal = useGoalStore((s) => s.clearGoal);
  const load = useGoalStore((s) => s.load);

  const suggestions = useMemo(() => suggestionsFrom(baseline), [baseline]);
  const [editedDraft, setDraft] = useState<string | null>(null);
  const draft = editedDraft ?? String(initialGoalValue(stored, baseline) ?? '');
  const litres = useMemo(() => parseGoalInput(draft), [draft]);

  useEffect(() => {
    load();
  }, [load]);

  const move = useCallback((by: number) => {
    tapSelection();
    setDraft((current) => {
      const entered = parseGoalInput(current ?? '');
      const next = entered === null ? MIN_WEEKLY_LITRES : clampGoal(entered + by);
      AccessibilityInfo.announceForAccessibility(
        copy.goal.sheet.announce(litresSpoken(next)),
      );
      return String(next);
    });
  }, []);

  const choose = useCallback((value: number) => {
    tapSelection();
    setDraft(String(clampGoal(value)));
  }, []);

  /* Reached from the record almost always, and by a deep link occasionally.
     The second case has nothing behind it, so the record is navigated to. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/history');
  }, [router]);

  const save = useCallback(async () => {
    if (litres === null) return;
    await setGoal(litres);
    AccessibilityInfo.announceForAccessibility(copy.goal.sheet.saved);
    close();
  }, [litres, setGoal, close]);

  const remove = useCallback(async () => {
    await clearGoal();
    close();
  }, [clearGoal, close]);

  const loggedWeeks = history.slice(0, -1).filter((week) => week.entryCount > 0).length;

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.bg }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.bar}>
        <SketchLink
          onPress={close}
          seed="goal/close"
          accessibilityLabel={copy.goal.sheet.close}
          style={styles.back}
        >
          {copy.goal.sheet.close}
        </SketchLink>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" tone="ink" accessibilityRole="header">
          {copy.goal.sheet.title}
        </Text>
        <Text variant="body" tone="inkSoft">
          {copy.goal.sheet.body}
        </Text>

        <View style={styles.stepper}>
          <Step
            label={copy.goal.sheet.less}
            hint={copy.goal.sheet.lessHint}
            glyph="–"
            seed="goal/less"
            onPress={() => move(-STEP_LITRES)}
          />
          <View style={styles.figure}>
            <GoalInput value={draft} onChange={setDraft} />
            <Text variant="heroUnit" tone="inkSoft">
              {copy.result.unit}
            </Text>
          </View>
          <Step
            label={copy.goal.sheet.more}
            hint={copy.goal.sheet.moreHint}
            glyph="+"
            seed="goal/more"
            onPress={() => move(STEP_LITRES)}
          />
        </View>

        <Text variant="axis" tone="inkSoft" style={styles.perDay}>
          {litres === null
            ? copy.goal.opening.enterHint
            : copy.goal.sheet.perDay(litresShort(litres / 7))}
        </Text>

        <View style={styles.marks}>
          {suggestions ? (
            <>
              <Text variant="axis" tone="inkSoft">
                {`${copy.goal.fromBaseline.title} ${litresShort(baseline ?? 0)}`}
              </Text>
              <Mark
                seed="goal/mark/tenth"
                title={copy.goal.fromBaseline.tenth}
                body={copy.goal.fromBaseline.tenthBody}
                value={suggestions[0].litres}
                chosen={litres === suggestions[0].litres}
                onPress={choose}
              />
              <Mark
                seed="goal/mark/quarter"
                title={copy.goal.fromBaseline.quarter}
                body={copy.goal.fromBaseline.quarterBody}
                value={suggestions[1].litres}
                chosen={litres === suggestions[1].litres}
                onPress={choose}
              />
              <Mark
                seed="goal/mark/hold"
                title={copy.goal.fromBaseline.hold}
                body={copy.goal.fromBaseline.holdBody}
                value={suggestions[2].litres}
                chosen={litres === suggestions[2].litres}
                onPress={choose}
              />
            </>
          ) : (
            <Text variant="axis" tone="inkSoft" style={styles.note}>
              {loggedWeeks > 0
                ? copy.goal.opening.note
                : copy.goal.opening.laterBody}
            </Text>
          )}
        </View>

        <SketchButton
          onPress={save}
          seed="goal/save"
          tone="accent"
          filled
          radius={radii.pill}
          accessibilityLabel={copy.goal.sheet.save}
          accessibilityState={{ disabled: litres === null }}
          disabled={litres === null}
          style={styles.save}
          contentStyle={styles.saveContent}
        >
          <Text variant="count" tone="accent">
            {copy.goal.sheet.save}
          </Text>
        </SketchButton>

        {stored !== null && (
          <SketchLink
            onPress={remove}
            seed="goal/remove"
            tone="inkSoft"
            accessibilityLabel={copy.goal.sheet.remove}
            accessibilityHint={copy.goal.sheet.removeHint}
            style={styles.remove}
          >
            {copy.goal.sheet.remove}
          </SketchLink>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------------------------------------------------------- parts -- */

function GoalInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { colors } = useTheme();
  const legible = usePreferences((s) => s.legibleText);

  return (
    <TextInput
      value={value}
      onChangeText={(next) => onChange(next.replace(/[^0-9]/g, '').slice(0, 6))}
      onBlur={() => {
        const parsed = parseGoalInput(value);
        if (parsed !== null) onChange(String(parsed));
      }}
      keyboardType="number-pad"
      inputMode="numeric"
      placeholder={copy.goal.opening.placeholder}
      placeholderTextColor={colors.inkFaint}
      selectionColor={colors.accent}
      accessibilityLabel={copy.goal.opening.enter}
      accessibilityHint={copy.goal.opening.enterHint}
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier.hero}
      style={[variantStyle('hero', legible), styles.input, { color: colors.ink }]}
    />
  );
}

function Step({
  label,
  hint,
  glyph,
  seed,
  onPress,
}: {
  label: string;
  hint: string;
  glyph: string;
  seed: string;
  onPress: () => void;
}) {
  return (
    <SketchButton
      onPress={onPress}
      seed={seed}
      tone="accent"
      radius={radii.pill}
      scale={0.8}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={styles.step}
      contentStyle={styles.stepContent}
    >
      <Text variant="title" tone="accent">
        {glyph}
      </Text>
    </SketchButton>
  );
}

function Mark({
  seed,
  title,
  body,
  value,
  chosen,
  onPress,
}: {
  seed: string;
  title: string;
  body: string;
  value: number;
  chosen: boolean;
  onPress: (value: number) => void;
}) {
  return (
    <SketchButton
      onPress={() => onPress(value)}
      seed={seed}
      tone={chosen ? 'accent' : 'quiet'}
      filled={chosen}
      radius={radii.md}
      scale={chosen ? 0.9 : 0.7}
      accessibilityLabel={`${title}. ${litresSpoken(value)} a week`}
      accessibilityHint={body}
      accessibilityState={{ selected: chosen }}
      style={styles.mark}
      contentStyle={styles.markContent}
    >
      <View style={styles.markLines}>
        <Text variant="label" tone="ink">
          {title}
        </Text>
        <Text variant="axis" tone="inkSoft">
          {body}
        </Text>
      </View>
      <Text variant="count" tone="accent" style={styles.markValue}>
        {formatLitres(value)}
      </Text>
    </SketchButton>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { paddingHorizontal: space.lg, paddingTop: space.sm },
  back: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
    gap: space.sm,
  },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    marginTop: space.lg,
  },
  figure: { alignItems: 'center' },
  input: { minWidth: 180, padding: 0, textAlign: 'center', fontVariant: ['tabular-nums'] },
  step: { minHeight: 52, minWidth: 52 },
  stepContent: { minHeight: 52, minWidth: 52, alignItems: 'center', justifyContent: 'center' },
  perDay: { textAlign: 'center' },

  marks: { gap: space.sm, marginTop: space.xl },
  mark: { alignSelf: 'stretch' },
  markContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  markLines: { flex: 1, gap: 2 },
  markValue: { fontVariant: ['tabular-nums'] },
  note: { marginTop: space.xs },

  save: { alignSelf: 'stretch', marginTop: space.xl, minHeight: 52 },
  saveContent: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  remove: { minHeight: 48, justifyContent: 'center', alignSelf: 'center', marginTop: space.sm },
});

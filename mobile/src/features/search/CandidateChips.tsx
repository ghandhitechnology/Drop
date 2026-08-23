/**
 * What else it might be.
 *
 * Recognition returns a score with every guess. Above `MULTI_CANDIDATE_SCORE`
 * it is telling you what the thing is and the card says so plainly. Below it,
 * it is offering a shortlist — and printing the top of a shortlist as if it
 * were an answer is the one dishonest thing this screen could do. So the
 * alternatives go under the name, drawn small, and the choice stays where it
 * belongs.
 *
 * Switching re-runs the engine against the active tables with the amount
 * recognition already read, so the hero number moves on the press with nothing
 * to wait for and nothing to fetch. The chips disappear entirely when
 * recognition was sure, which is most of the time.
 */

import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../design/tokens';
import { copy } from '../../lib/copy';
import { SketchButton } from '../../ui/SketchButton';
import { Text } from '../../ui/Text';
import { useCaptureMachine } from '../capture/useCaptureMachine';
import { useCandidates } from './candidates';
import { estimateFor } from './estimate';

/** The states a swap is allowed to land in — every one that shows a result. */
const SWAPPABLE = new Set(['presenting', 'expanded', 'adjusting']);

/**
 * Put a different candidate's estimate in front of the person.
 *
 * The machine's own `reviseEstimate` is scoped to the amount editor, so this
 * writes the swap through the store directly. It is the same operation —
 * replace `estimate`, leave the state name and the frozen frame exactly where
 * they are — and it is guarded by the same rule: nothing outside a live result
 * can be swapped, and nothing here can reach history without the confirm the
 * card already owns.
 */
function swapEstimate(catalogId: string): boolean {
  const store = useCaptureMachine.getState();
  const state = store.state;
  if (!SWAPPABLE.has(state.name) || !('estimate' in state)) return false;

  const { quantity } = useCandidates.getState();
  const outcome = estimateFor({
    catalogId,
    quantity: quantity ? { value: quantity.value, unit: quantity.unit } : null,
    source: quantity?.basis === 'package_label' ? 'package_label' : 'vision_estimate',
  });
  if (!outcome) return false;

  useCaptureMachine.setState({ state: { ...state, estimate: outcome.estimate } });
  return true;
}

export function CandidateChips() {
  const list = useCandidates((s) => s.list);
  const picked = useCandidates((s) => s.picked);
  const pick = useCandidates((s) => s.pick);

  const choose = useCallback(
    (catalogId: string) => {
      if (catalogId === picked) return;
      if (swapEstimate(catalogId)) pick(catalogId);
    },
    [picked, pick],
  );

  if (list.length < 2) return null;

  return (
    <View style={styles.root}>
      <Text variant="label" tone="inkSoft">
        {copy.result.otherMatches}
      </Text>

      <View style={styles.row}>
        {list.map((candidate) => {
          const active = candidate.catalogId === picked;
          return (
            <SketchButton
              key={candidate.catalogId}
              onPress={() => choose(candidate.catalogId)}
              seed={`result/candidate/${candidate.catalogId}`}
              tone={active ? 'accent' : 'quiet'}
              radius={18}
              scale={active ? 0.92 : 0.66}
              contentStyle={styles.chip}
              accessibilityLabel={copy.result.switchTo(candidate.label)}
              accessibilityState={{ selected: active }}
            >
              <Text variant="chip" tone={active ? 'accent' : 'inkSoft'} numberOfLines={1}>
                {candidate.label}
              </Text>
            </SketchButton>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});

/**
 * The other way in.
 *
 * Everything here happens on the device. The 463-item catalogue is already in
 * memory by the time the sheet opens — warmed at boot beside the factor
 * tables — so results move under the caret with no round trip, no debounce and
 * no spinner, and the whole screen works with the radio off.
 *
 * Two steps, one sheet: the list, then the amount. They swap in place rather
 * than pushing a route, because the second step is one number and a button and
 * a person who changed their mind should be one tap from the list again.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';

import { useTheme } from '../../design/theme';
import { radius, space } from '../../design/tokens';
import { hydrateCatalog, useCatalogStore } from '../../data/catalogStore';
import { clearSearchPicks, type SearchPick } from './pick';
import type { CatalogItem } from '../../data/types';
import { Grain } from '../../drawing/grain';
import { copy } from '../../lib/copy';
import { Text } from '../../ui/Text';
import { Touch } from '../../ui/Touch';
import { MAX_PLATE_ITEMS } from '../capture/pipeline';
import { AmountStep } from './AmountStep';
import { servingFor } from './estimate';
import { handOffAfterDismiss } from './handoff';
import { ResultRow } from './ResultRow';
import { SearchField } from './SearchField';
import type { WireUnit } from '../../data/api';

/** How many matches a sheet shows before the list stops being scannable. */
const RESULT_LIMIT = 30;

/** How many everyday things stand in the list before anything is typed. */
const BROWSE_LIMIT = 24;

export type SearchSheetProps = {
  /** Closes the route. Called before the sequence starts on the camera. */
  onDismiss: () => void;
};

export function SearchSheet({ onDismiss }: SearchSheetProps) {
  const { colors } = useTheme();
  const fieldRef = useRef<TextInput>(null);

  const status = useCatalogStore((s) => s.status);
  const items = useCatalogStore((s) => s.items);
  const search = useCatalogStore((s) => s.search);

  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<CatalogItem | null>(null);
  /** Things kept for one combined hand-off, in the order they were added. */
  const [basket, setBasket] = useState<SearchPick[]>([]);
  const handedOff = useRef(false);

  useEffect(() => {
    hydrateCatalog();
  }, []);

  // A sheet swiped away rather than chosen through leaves nothing staged, so
  // the next photo can never quietly resolve to whatever was tapped last.
  useEffect(
    () => () => {
      if (!handedOff.current) clearSearchPicks();
    },
    [],
  );

  const trimmed = query.trim();

  const results = useMemo(() => {
    if (!trimmed) return items.slice(0, BROWSE_LIMIT);
    return search(trimmed, RESULT_LIMIT).map((hit) => hit.item);
  }, [trimmed, items, search]);

  // The count is the one thing a screen reader has no other way to learn, so
  // it is spoken once the typing settles rather than on every keystroke.
  useEffect(() => {
    if (!trimmed) return;
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(
        copy.search.announce.results(results.length, trimmed),
      );
    }, 450);
    return () => clearTimeout(timer);
  }, [trimmed, results.length]);

  const handlePick = useCallback((item: CatalogItem) => {
    Keyboard.dismiss();
    setChosen(item);
  }, []);

  const pickFrom = useCallback(
    (item: CatalogItem, quantity: number, userEntered: boolean): SearchPick => ({
      catalogId: item.id,
      displayName: item.label,
      quantity: { value: quantity, unit: item.defaultUnit as WireUnit },
      userEntered,
    }),
    [],
  );

  const handleGo = useCallback(
    (quantity: number, userEntered: boolean) => {
      if (!chosen) return;
      handedOff.current = true;
      handOffAfterDismiss([...basket, pickFrom(chosen, quantity, userEntered)]);
      onDismiss();
    },
    [chosen, basket, pickFrom, onDismiss],
  );

  /** Keep this one and come back to the list for the next. */
  const handleAddAnother = useCallback(
    (quantity: number, userEntered: boolean) => {
      if (!chosen) return;
      const next = [...basket, pickFrom(chosen, quantity, userEntered)];
      setBasket(next);
      setChosen(null);
      setQuery('');
      AccessibilityInfo.announceForAccessibility(
        copy.search.announce.added(chosen.label, next.length),
      );
    },
    [chosen, basket, pickFrom],
  );

  /** Everything kept so far, handed off from the list without another pick. */
  const handleGoWithBasket = useCallback(() => {
    if (basket.length === 0) return;
    handedOff.current = true;
    handOffAfterDismiss(basket);
    onDismiss();
  }, [basket, onDismiss]);

  const basisFor = useCallback(
    (item: CatalogItem) => servingFor(item.id)?.basis ?? null,
    [],
  );

  const heading = trimmed ? copy.search.matches(results.length) : copy.search.browse;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Grain />

      {chosen ? (
        <View style={styles.amountBody}>
          <AmountStep
            item={chosen}
            basis={basisFor(chosen)}
            onBack={() => setChosen(null)}
            onGo={handleGo}
            onAddAnother={
              basket.length + 1 < MAX_PLATE_ITEMS ? handleAddAnother : undefined
            }
          />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text variant="title" tone="ink">
              {copy.search.title}
            </Text>
            <SearchField
              ref={fieldRef}
              value={query}
              onChange={setQuery}
              onSubmit={() => {
                const first = results[0];
                if (first) handlePick(first);
              }}
            />
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            nestedScrollEnabled
            scrollEnabled
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text variant="label" tone="inkSoft">
                  {status === 'ready' ? heading : copy.search.opening}
                </Text>
                {basket.length > 0 && (
                  <Text variant="chip" tone="accent">
                    {copy.search.soFar(basket.length)} ·{' '}
                    {basket.map((entry) => entry.displayName).join(' · ')}
                  </Text>
                )}
              </View>
            }
            ListEmptyComponent={
              status === 'ready' && trimmed ? (
                <View style={styles.empty}>
                  <Text variant="title" tone="ink">
                    {copy.search.empty}
                  </Text>
                  <Text variant="body" tone="inkSoft">
                    {copy.search.emptyHint(items.length)}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <ResultRow item={item} basis={basisFor(item)} onPress={handlePick} />
            )}
          />

          <View style={styles.footer}>
            {basket.length > 0 && (
              <Touch
                onPress={handleGoWithBasket}
                style={[
                  styles.goMany,
                  { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                ]}
                accessibilityLabel={copy.search.goMany(basket.length)}
                accessibilityHint={copy.search.goManyHint}
              >
                <Text variant="label" tone="accent">
                  {copy.search.goMany(basket.length)}
                </Text>
              </Touch>
            )}
            <Touch
              onPress={onDismiss}
              style={styles.back}
              accessibilityLabel={copy.search.back}
            >
              <Text variant="label" tone="inkSoft">
                {copy.search.back}
              </Text>
            </Touch>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  /**
   * The amount step is one item, one number and one button. The sheet keeps
   * whatever height the list left it at, so the block is centred rather than
   * left stranded at the top of an empty page.
   */
  amountBody: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.lg },
  list: { flex: 1, marginTop: space.md },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  listHeader: { paddingVertical: space.sm, gap: space.xs },
  empty: { paddingTop: space.xl, gap: space.sm },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.xs },
  goMany: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});

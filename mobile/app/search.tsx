import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../src/design/theme';
import { SearchSheet } from '../src/features/search/SearchSheet';

/**
 * The catalogue, over the camera.
 *
 * Presented as a sheet (see `app/_layout.tsx`) so the viewfinder stays visible
 * behind it — this is a detour, and the screen it detours from is still where
 * the person is. Dismissing without choosing leaves the camera exactly as it
 * was, including any frame it was holding.
 */
export default function Search() {
  const { colors } = useTheme();
  const router = useRouter();

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <SearchSheet onDismiss={dismiss} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
});

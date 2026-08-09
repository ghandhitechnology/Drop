import {
  Gaegu_400Regular,
  Gaegu_700Bold,
} from '@expo-google-fonts/gaegu';
import {
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import {
  ShantellSans_400Regular,
  ShantellSans_500Medium,
  ShantellSans_600SemiBold,
  ShantellSans_700Bold,
} from '@expo-google-fonts/shantell-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeProvider, useTheme } from '../src/design/theme';

SplashScreen.preventAutoHideAsync();

/**
 * The splash leaves by dissolving into the first frame rather than cutting to
 * it. Its ground is already the theme's, so across the fade there is nothing to
 * see changing colour — only the logo going and the camera arriving.
 */
SplashScreen.setOptions({ duration: 320, fade: true });

function Navigator() {
  const { colors, scheme } = useTheme();

  // The window's own background, underneath React's. Without it the frame
  // between the splash going and the first screen painting is whatever the
  // platform picked — a white flash in the dark theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        // The system bars belong to the screen under them, so they are set
        // per screen by the navigator rather than by a component racing the
        // rest of the tree to be the last one mounted. Paper screens take
        // the theme's ink; the viewfinder overrides both below.
        statusBarStyle: scheme === 'dark' ? 'light' : 'dark',
        navigationBarColor: colors.bg,
      }}
    >
      {/*
        The camera is the one screen whose ground is the world rather than
        the app. It runs under both bars — the frame reaches the very top and
        the very bottom — and its marks stay light in either theme, because a
        viewfinder is closer to night than to paper.
      */}
      <Stack.Screen
        name="index"
        options={{ statusBarStyle: 'light', navigationBarColor: 'transparent' }}
      />
      {/*
        The catalogue is a detour, not a destination: it rides up as a sheet
        so the viewfinder stays visible behind it and dismissing puts the
        person back exactly where they were. It opens at the screen's midpoint
        and can expand near-full for scanning results, with the grabber visible
        so swiping down remains discoverable.
      */}
      <Stack.Screen
        name="search"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5, 0.96],
          sheetInitialDetentIndex: 0,
          sheetExpandsWhenScrolledToEdge: false,
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />

      {/*
        The welcome owns the whole screen and has no way back into itself —
        it is entered by redirect and left by replace, so the gesture that
        would drag it aside is switched off rather than left to reveal a
        camera the person has yet to say yes to.
      */}
      <Stack.Screen
        name="onboarding"
        options={{
          animation: 'fade',
          gestureEnabled: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />

      {/*
        Settings is a detour from the camera, not a place in the hierarchy,
        so it rides up as a modal and swipes back down.
      */}
      <Stack.Screen
        name="settings"
        options={{
          presentation: 'modal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ShantellSans_400Regular,
    ShantellSans_500Medium,
    ShantellSans_600SemiBold,
    ShantellSans_700Bold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Gaegu_400Regular,
    Gaegu_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <Navigator />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

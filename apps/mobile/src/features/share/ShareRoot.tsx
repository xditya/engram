import '../../polyfills';
import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { FONTS } from '../../theme/fonts';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useShareIntent } from 'expo-share-intent';
import { useEngram } from '../../lib/engram';
import '../settings/appearance';
import { ShareOverlay } from './ShareOverlay';

// Root component of Android's translucent ShareActivity: no router, nothing opaque, just the overlay.
export function ShareRoot() {
  const [loaded, fontError] = useFonts(FONTS);
  const { engram, error } = useEngram();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const ready = (loaded || !!fontError) && (!!engram || !!error);

  // The splash lifecycle hooks every ReactActivity; never hold this window's first frame.
  useEffect(() => { void SplashScreen.hideAsync(); }, []);

  // Clear the native intent first so a later launch from the launcher opens the Library, then finish the activity.
  const finish = useCallback(() => { resetShareIntent(); BackHandler.exitApp(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !hasShareIntent) return null;
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
        <ShareOverlay intent={shareIntent} error={error?.message} finish={finish} />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

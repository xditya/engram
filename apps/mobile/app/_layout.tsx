import '../src/polyfills';
import { useEffect, useState } from 'react';
import { Modal, Platform as RN, Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '../src/theme/useTheme';
import { useEngram, useToast, type ShareIntentLike } from '../src/lib/engram';
import { ShareSheet, useSavedToast } from '../src/features/capture';
import { listenForScreenshots, saveLatestScreenshot, useScreenshotPrompt } from '../src/lib/screenshots';
import { Text } from '../src/ui';
import '../src/features/settings/appearance';

SplashScreen.preventAutoHideAsync();

// expo-share-intent touches its native module on import; web export has none. On Android the share intent
// never reaches this tree: the translucent ShareActivity mounts src/features/share/ShareRoot instead.
type ShareHook = () => { hasShareIntent: boolean; shareIntent: ShareIntentLike; resetShareIntent: () => void };
const useShareIntent: ShareHook = RN.OS !== 'ios'
  ? () => ({ hasShareIntent: false, shareIntent: {}, resetShareIntent: () => {} })
  : (require('expo-share-intent') as typeof import('expo-share-intent')).useShareIntent;

// Share sheet / share intent and engram://save?url=… both land here: save, go home, say "Saved".
function useCaptureIntents() {
  const { engram } = useEngram();
  const router = useRouter();
  const show = useToast((s) => s.show);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const url = Linking.useURL();

  const [intent, setIntent] = useState<ShareIntentLike | null>(null);
  const saved = useSavedToast();

  useEffect(() => {
    if (!engram || !hasShareIntent) return;
    resetShareIntent();
    setIntent(shareIntent);
  }, [engram, hasShareIntent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!engram || !url) return;
    const { hostname, path, queryParams } = Linking.parse(url);
    // engram://save?url=… parses as hostname 'save'; https://engram.xditya.me/save?url=… as path '/save'.
    if ((path?.replace(/^\//, '') || hostname) !== 'save') return;
    const target = typeof queryParams?.url === 'string' ? queryParams.url : null;
    if (!target) return;
    engram.capture.saveUrl(target, { note: typeof queryParams?.note === 'string' ? queryParams.note : undefined })
      .then(() => { show('Saved'); router.replace('/'); })
      .catch((e) => show(`Couldn't save: ${(e as Error).message}`));
  }, [engram, url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!intent) return null;
  return (
    <Modal transparent animationType="slide" onRequestClose={() => setIntent(null)}>
      <Pressable onPress={() => setIntent(null)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable onPress={() => {}}>
          <ShareSheet intent={intent} onDone={(items) => { setIntent(null); saved(items.map((i) => i.id)); router.replace('/'); }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// "Save this screenshot?" row, shown for a few seconds after a screenshot is taken with engram in front.
function ScreenshotPrompt() {
  const { c, space } = useTheme();
  const pending = useScreenshotPrompt((s) => s.pending);
  const dismiss = useScreenshotPrompt((s) => s.dismiss);
  const show = useToast((s) => s.show);
  if (!pending) return null;
  return (
    <View style={{ position: 'absolute', left: space[4], right: space[4], bottom: 92, flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: space[3], borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Text size="sm" color="text2" style={{ flex: 1 }}>Save this screenshot?</Text>
      <Pressable accessibilityRole="button" onPress={() => void saveLatestScreenshot().catch((e: Error) => { console.warn('screenshot save', e); show(`Couldn't save: ${e.message}`); })} style={{ minHeight: 44, paddingHorizontal: space[3], justifyContent: 'center' }}>
        <Text size="sm" weight={500} color="accent">Save</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} style={{ minHeight: 44, paddingHorizontal: space[3], justifyContent: 'center' }}>
        <Text size="sm" color="text3">Not now</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const { c, dark } = useTheme();
  const { engram, error } = useEngram();
  const [loaded, fontError] = useFonts({
    Geist: Geist_400Regular,
    'Geist-Medium': Geist_500Medium,
    'Geist-SemiBold': Geist_600SemiBold,
    GeistMono: GeistMono_400Regular,
    'GeistMono-Medium': GeistMono_500Medium,
  });
  const ready = (loaded || !!fontError) && (!!engram || !!error);

  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);
  useEffect(() => { if (engram) listenForScreenshots(); }, [engram]);
  const shareSheet = useCaptureIntents();

  if (!ready) return null;

  const sheet = { presentation: 'modal', gestureEnabled: true } as const;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="search" options={sheet} />
        <Stack.Screen name="card/[id]" options={sheet} />
        <Stack.Screen name="note/[id]" options={sheet} />
        <Stack.Screen name="capture" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5, 1], gestureEnabled: true }} />
        <Stack.Screen name="spaces" />
        <Stack.Screen name="spaces/[id]" />
        <Stack.Screen name="resurface" options={sheet} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="sync" />
      </Stack>
      {shareSheet}
      <ScreenshotPrompt />
    </GestureHandlerRootView>
  );
}

import '../src/polyfills';
import { useCallback, useEffect, useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Modal, Pressable, View } from 'react-native';
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
import { useShake } from '../src/lib/useShake';
import { useShareLog } from '../src/lib/shareLog';
import { takeSharedPasteboard } from '../modules/engram-diag';
import * as Haptics from 'expo-haptics';
import { Text } from '../src/ui';
import '../src/features/settings/appearance';

SplashScreen.preventAutoHideAsync();

// Shares never reach this tree on either platform: Android's ShareActivity and the iOS share extension each
// mount src/features/share with their own root. Only the iOS no-App-Group hand-off (&p=) lands here.
// engram://save?url=… lands here too: save, go home, say "Saved".
function useCaptureIntents() {
  const { engram } = useEngram();
  const router = useRouter();
  const show = useToast((s) => s.show);
  const url = Linking.useURL();
  const log = useShareLog((s) => s.add);
  useEffect(() => { if (url) log('link', url); }, [url, log]);

  const [intent, setIntent] = useState<ShareIntentLike | null>(null);
  const saved = useSavedToast();

  useEffect(() => {
    if (!engram || !url) return;
    // Share extension hand-off without a usable App Group: the payload rides in the link (&p=), or media
    // sits on the same-team pasteboard (p=pasteboard). With a group, the extension saves by itself.
    const p = /[?&]p=([A-Za-z0-9_-]+)/.exec(url)?.[1];
    if (p && /dataUrl=/.test(url)) {
      try {
        const bin = atob(p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.length % 4)) % 4));
        const text = decodeURIComponent(Array.from(bin, (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        if (text === 'pasteboard') {
          const files = takeSharedPasteboard();
          log('share', `pasteboard: ${files.length} file(s)`);
          if (files.length) setIntent({ files: files.map((f) => ({ path: f })) });
          else log('error', 'pasteboard: nothing to take');
        } else {
          const json = JSON.parse(text) as { webUrl?: string; text?: string };
          log('share', `link payload: ${JSON.stringify(json).slice(0, 160)}`);
          if (json.webUrl || json.text) setIntent({ webUrl: json.webUrl ?? null, text: json.text ?? null });
        }
      } catch (e) { log('error', `payload: ${(e as Error).message}`); }
      return;
    }
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
// The app-wide one-line status pill ("Saved", "Couldn't sync"). Anything calls useToast.show; only this renders it.
function Toast() {
  const { c, space } = useTheme();
  const message = useToast((s) => s.message);
  const action = useToast((s) => s.action);
  const hide = useToast((s) => s.hide);
  const fire = useCallback(() => { if (!action) return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); action.onPress(); hide(); }, [action, hide]);
  useShake(!!action?.shake, fire);
  if (!message) return null;
  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} pointerEvents={action ? 'box-none' : 'none'} style={{ position: 'absolute', left: 0, right: 0, bottom: 148, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ minHeight: 44, paddingLeft: space[5], paddingRight: action ? space[2] : space[5], borderRadius: 22, backgroundColor: c.text, flexDirection: 'row', alignItems: 'center', gap: space[3], maxWidth: '86%' }}>
        <Text size="sm" weight={500} numberOfLines={2} style={{ color: c.bg, fontSize: 15, flexShrink: 1 }}>{message}</Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={() => { action.onPress(); hide(); }} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: space[3], justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text size="sm" weight={600} style={{ color: c.accent, fontSize: 15 }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

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
        <Stack.Screen name="capture" options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetCornerRadius: 20, gestureEnabled: true }} />
        <Stack.Screen name="spaces" />
        <Stack.Screen name="spaces/[id]" />
        <Stack.Screen name="resurface" options={sheet} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="sync" />
      </Stack>
      {shareSheet}
      <ScreenshotPrompt />
      <Toast />
    </GestureHandlerRootView>
  );
}

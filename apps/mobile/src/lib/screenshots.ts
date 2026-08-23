import { Platform } from 'react-native';
import { create } from 'zustand';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as ScreenCapture from 'expo-screen-capture';
import * as Watcher from '../../modules/engram-screenshots';
import { engram } from './engram';
import { useSettings } from './settings';
import { useToast } from './toast';

// In-app prompt: a screenshot taken while engram is in front sets `pending`; the root layout renders the
// "Save this screenshot?" row while it is set. Background detection is Android only (the native watcher).
export const useScreenshotPrompt = create<{ pending: boolean; dismiss(): void }>((set) => ({ pending: false, dismiss: () => set({ pending: false }) }));

let timer: ReturnType<typeof setTimeout> | undefined;
export function listenForScreenshots(): void {
  if (Platform.OS === 'web') return;
  ScreenCapture.addScreenshotListener(() => {
    useScreenshotPrompt.setState({ pending: true });
    clearTimeout(timer);
    timer = setTimeout(() => useScreenshotPrompt.setState({ pending: false }), 8000);
  });
  // Android watcher follows the setting: on boot, and whenever it changes.
  if (!Watcher.isSupported()) return;
  const apply = (on: boolean) => { if (on && !Watcher.isRunning()) Watcher.start(); else if (!on && Watcher.isRunning()) Watcher.stop(); };
  apply(useSettings.getState().capture.screenshotWatch);
  useSettings.subscribe((s, prev) => { if (s.capture.screenshotWatch !== prev.capture.screenshotWatch) apply(s.capture.screenshotWatch); });
}

// Newest photo in the library is the screenshot that was just taken. Permission is asked here, lazily.
export async function saveLatestScreenshot(): Promise<void> {
  useScreenshotPrompt.setState({ pending: false });
  const show = useToast.getState().show;
  const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (!perm.granted) return show('Photo access is needed to save screenshots');
  const page = await MediaLibrary.getAssetsAsync({ mediaType: 'photo', sortBy: 'creationTime', first: 1 });
  const asset = page.assets[0];
  if (!asset) return show('No screenshot found');
  // Android hands back a file:// uri; iOS a ph:// one that needs resolving (getAssetInfoAsync wants ACCESS_MEDIA_LOCATION on Android).
  const uri = Platform.OS === 'ios' ? (await MediaLibrary.getAssetInfoAsync(asset)).localUri ?? asset.uri : asset.uri;
  await engram().capture.saveFiles([uri]);
  show('Saved');
}

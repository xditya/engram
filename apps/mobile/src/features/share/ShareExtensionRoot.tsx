import '../../polyfills';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { close, openHostApp, type InitialProps } from 'expo-share-extension';
import { createEngramLite } from '../../lib/engramLite';
import { bootWith, useBootState } from '../../lib/hub';
import { textDefaults } from '../../ui/Text';
import '../settings/appearance';
import { ShareOverlay } from './ShareOverlay';

textDefaults.allowFontScaling = false;

// Root of the iOS share extension: the Save Moment over the sharing app, saving straight into the App Group
// database. The Swift side only mounts this when that container exists; otherwise it hands off to the app.
export function ShareExtensionRoot(props: InitialProps) {
  const [loaded, fontError] = useFonts({
    Geist: Geist_400Regular,
    'Geist-Medium': Geist_500Medium,
    'Geist-SemiBold': Geist_600SemiBold,
    GeistMono: GeistMono_400Regular,
    'GeistMono-Medium': GeistMono_500Medium,
  });
  useEffect(() => { void bootWith(createEngramLite); }, []);
  const { engram, error } = useBootState();
  if (!(loaded || fontError) || !(engram || error)) return null;
  const files = [...(props.images ?? []), ...(props.videos ?? []), ...(props.files ?? [])].map((path) => ({ path }));
  const intent = { webUrl: props.url ?? null, text: props.text ?? null, files: files.length ? files : null };
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
        <ShareOverlay intent={intent} error={error?.message} finish={close} open={(url) => openHostApp(url.replace(/^engram:\/\//, ''))} />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

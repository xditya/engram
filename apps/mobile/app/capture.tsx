import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Item } from '@engram/core';
import { useSavedToast } from '../src/features/capture';
import { Icon, type IconName } from '../src/icons/Icon';
import { engram, useToast } from '../src/lib/engram';
import { useTheme } from '../src/theme/useTheme';
import { Text } from '../src/ui';

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export default function CaptureSheet() {
  const { c, space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const saved = useSavedToast();
  const show = useToast((s) => s.show);

  // Every tile ends the same way: haptic, dismiss, toast keyed to the saved items' jobs.
  const done = (items: Item[] | Item) => {
    const list = Array.isArray(items) ? items : [items];
    if (!list.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
    saved(list.map((i) => i.id));
  };
  const run = (fn: () => Promise<void>) => { fn().catch((e: Error) => show(`Couldn't save: ${e.message}`)); };

  const paste = () => run(async () => {
    const { capture } = engram();
    // hasUrlAsync/getUrlAsync are iOS-only; a URL is just a string that looks like one.
    const s = (await Clipboard.hasStringAsync()) ? (await Clipboard.getStringAsync()).trim() : '';
    if (/^https?:\/\/\S+$/i.test(s)) return done(await capture.saveUrl(s));
    if (await Clipboard.hasImageAsync()) {
      const img = await Clipboard.getImageAsync({ format: 'png' });
      if (img) {
        const f = new File(Paths.cache, `clipboard-${Date.now()}.png`);
        f.write(Uint8Array.from(atob(img.data.replace(/^data:[^,]*,/, '')), (ch) => ch.charCodeAt(0)));
        return done(await capture.saveFiles([f.uri]));
      }
    }
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return show('Clipboard is empty');
    if (isUrl(text)) return done(await capture.saveUrl(text));
    Alert.alert('Save as', text.length > 120 ? `${text.slice(0, 120)}…` : text, [
      { text: 'Note', onPress: () => done(capture.saveNote(text)) },
      { text: 'Quote', onPress: () => done(capture.saveQuote(text)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  });

  const photos = () => run(async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1 });
    if (!r.canceled) done(await engram().capture.saveFiles(r.assets.map((a) => a.uri)));
  });
  const files = () => run(async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (!r.canceled) done(await engram().capture.saveFiles(r.assets.map((a) => a.uri)));
  });
  const photoOrFile = () => Alert.alert('Photo / File', undefined, [
    { text: 'Photo', onPress: photos },
    { text: 'File', onPress: files },
    { text: 'Cancel', style: 'cancel' },
  ]);

  const camera = () => run(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return show('Camera access is off in Settings');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled) done(await engram().capture.saveFiles(r.assets.map((a) => a.uri))); // OCR runs as the image's job
  });

  const tiles: { icon: IconName; label: string; hint: string; onPress: () => void }[] = [
    { icon: 'type-note', label: 'Note', hint: 'Start typing', onPress: () => router.replace('/note/new' as never) },
    { icon: 'type-link', label: 'Paste', hint: 'Link on clipboard', onPress: paste },
    { icon: 'type-image', label: 'Photo / File', hint: 'From your library', onPress: photoOrFile },
    { icon: 'type-article', label: 'Camera', hint: 'Scan to text', onPress: camera },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space[4], paddingBottom: Math.max(insets.bottom, space[4]) + space[2], gap: space[3] }}>
      <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.line }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t) => (
          <Pressable
            key={t.label}
            accessibilityRole="button"
            accessibilityLabel={`${t.label}. ${t.hint}`}
            onPress={t.onPress}
            style={({ pressed }) => ({ width: '48%', flexGrow: 1, backgroundColor: c.surface, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 16, gap: 8, opacity: pressed ? 0.8 : 1 })}
          >
            <Icon name={t.icon} />
            <Text weight={500} size="sm">{t.label}</Text>
            <Text size="xs" color="text2">{t.hint}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

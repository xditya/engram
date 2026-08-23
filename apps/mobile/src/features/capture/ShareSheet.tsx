import { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { extract, type Item, type ItemType } from '@engram/core';
import { Icon, type IconName } from '../../icons/Icon';
import { engram, useToast, type ShareIntentLike } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Button, Text } from '../../ui';
import { splitTags } from './tags';

export const glyph: Partial<Record<ItemType, IconName>> = { article: 'type-article', video: 'type-video', image: 'type-image', pdf: 'type-pdf', product: 'type-product', quote: 'type-quote', note: 'type-note' };
const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// What the share target hands us, described without touching the network.
export function describe(s: ShareIntentLike): { type: ItemType; title: string; meta: string } {
  if (s.webUrl) {
    const type = extract.guessTypeFromUrl(s.webUrl);
    return { type, title: s.text && s.text !== s.webUrl ? s.text : domainOf(s.webUrl), meta: `${type === 'note' ? 'link' : type} · ${domainOf(s.webUrl)}` };
  }
  if (s.files?.length) {
    const n = s.files.length;
    const p = s.files[0]!.path;
    const ext = p.split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
    const kind = /^(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/.test(ext) || /\/images?\//.test(p) ? 'image'
      : /^(mp4|mov|webm|mkv|avi)$/.test(ext) || /\/video\//.test(p) ? 'video'
      : ext === 'pdf' ? 'pdf' : 'file';
    const name = p.split('/').pop() ?? kind;
    return { type: kind === 'file' ? 'image' : kind, title: n > 1 ? `${n} files` : name, meta: n > 1 ? `${n} files` : kind };
  }
  return { type: 'note', title: (s.text ?? '').trim().split('\n')[0]!.slice(0, 80), meta: 'note' };
}

// Compact capture sheet (<= 280 px). Save writes locally, shows the Saved pill for 800 ms, then onDone(items).
export function ShareSheet({ intent, onDone }: { intent: ShareIntentLike; onDone: (items: Item[]) => void }) {
  const { c, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [field, setField] = useState('');
  const [saved, setSaved] = useState(false);
  const show = useToast((s) => s.show);
  const d = describe(intent);

  const save = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const e = engram();
    const { note, tags } = splitTags(field);
    let items: Item[];
    try {
      if (intent.webUrl) items = [await e.capture.saveUrl(intent.webUrl, { note: note ?? (intent.text !== intent.webUrl ? intent.text ?? undefined : undefined), tags })];
      else {
        items = await e.capture.fromShareIntent(intent);
        for (const it of items) {
          if (tags.length) e.db.tags.set(it.id, [...new Set([...e.db.tags.of(it.id), ...tags])]);
          if (note) e.db.items.update(it.id, { body: it.body ? `${it.body}\n\n${note}` : note });
        }
      }
    } catch (err) { show(`Couldn't save: ${(err as Error).message}`); return; }
    setSaved(true);
    setTimeout(() => onDone(items), 800);
  };

  if (saved) return <SavedPill />;
  return (
    <View style={{ maxHeight: 280, backgroundColor: c.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space[4], paddingBottom: Math.max(insets.bottom, space[4]) + 6, gap: space[3] }}>
      <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.line }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: c.surface, borderRadius: 12, padding: space[3] }}>
        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={glyph[d.type] ?? 'type-link'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" weight={500} numberOfLines={1}>{d.title}</Text>
          <Text size="xs" mono color="text3" style={{ marginTop: 3 }}>{d.meta}</Text>
        </View>
      </View>
      <TextInput
        value={field}
        onChangeText={setField}
        placeholder="Add a note or #tags"
        placeholderTextColor={c.text3}
        accessibilityLabel="Add a note or tags"
        style={{ minHeight: 44, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, paddingHorizontal: space[3], fontFamily: 'Geist', fontSize: 14, color: c.text }}
      />
      <Button title="Save" onPress={() => void save()} />
    </View>
  );
}

// The one spring overshoot in the app.
function SavedPill() {
  const { c } = useTheme();
  const s = useSharedValue(0.6);
  s.value = withSpring(1, { damping: 9, stiffness: 220 });
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <View style={{ height: 280, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View entering={FadeIn.duration(120)} style={[{ height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: c.text, justifyContent: 'center' }, style]}>
        <Text weight={500} style={{ fontSize: 15, color: '#FFFFFF' }}>Saved</Text>
      </Animated.View>
    </View>
  );
}


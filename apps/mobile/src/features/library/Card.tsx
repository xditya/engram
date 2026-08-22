import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Trace } from '../../icons/Icon';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import { duration, parseMeta } from './format';
import type { Entry } from './useLibrary';

export interface CardProps {
  entry: Entry;
  width: number;
  selecting: boolean;
  selected: boolean;
  showTrace: boolean;
  fresh: boolean; // saved after this screen mounted: fades in
  onPress: () => void;
  onLongPress: () => void;
}

export function Card({ entry, width, selecting, selected, showTrace, fresh, onPress, onLongPress }: CardProps) {
  const { c, dark, radius, space, motion, trace } = useTheme();
  const { item, thumb, uri, strength } = entry;
  const ratio = thumb?.w && thumb.h ? Math.min(2, Math.max(0.5, thumb.h / thumb.w)) : 1;
  const meta = parseMeta(item.meta);
  const pad = space[3];

  const img = uri
    ? <Image source={{ uri }} style={{ width, height: Math.round(width * ratio), backgroundColor: c.surface2 }} contentFit="cover" accessibilityIgnoresInvertColors />
    : null;
  const block = (h: number) => <View style={{ width, height: Math.round(width * h), backgroundColor: c.surface2 }} />;
  const domain = item.domain ? <Text size="xs" mono color="text3" numberOfLines={1}>{item.domain}</Text> : null;

  let body: ReactNode;
  switch (item.type) {
    case 'image':
      body = img ?? block(1);
      break;
    case 'note':
      body = (
        <View style={{ padding: pad }}>
          <Text size="sm" lineHeight="body" numberOfLines={6} style={{ fontSize: 13 }}>{item.body ?? item.title ?? ''}</Text>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 24 }}>
            {[0.35, 0.65, 0.9].map((o) => <View key={o} style={{ flex: 1, backgroundColor: c.surface, opacity: o }} />)}
          </View>
        </View>
      );
      break;
    case 'quote':
      body = (
        <View style={{ padding: pad, gap: space[1] }}>
          <Text color="text3" style={{ fontSize: 24, lineHeight: 24 }}>{'“'}</Text>
          <Text size="sm" lineHeight="body">{item.body ?? item.title ?? ''}</Text>
          {item.domain || item.title ? <Text size="xs" mono color="text3" numberOfLines={1}>{item.domain ?? item.title}</Text> : null}
        </View>
      );
      break;
    case 'video':
      body = (
        <View>
          {img ?? block(0.56)}
          {typeof meta.duration === 'number' ? (
            <View style={{ position: 'absolute', right: 6, top: Math.round(width * (img ? ratio : 0.56)) - 26, paddingHorizontal: 6, height: 20, borderRadius: 4, justifyContent: 'center', backgroundColor: dark ? 'rgba(237,239,242,0.14)' : 'rgba(21,23,26,0.82)' }}>
              <Text size="xs" mono style={{ fontSize: 11, lineHeight: 14, color: dark ? c.text : '#FFFFFF' }}>{duration(meta.duration)}</Text>
            </View>
          ) : null}
          {item.title ? <Text size="sm" weight={500} numberOfLines={2} style={{ padding: pad }}>{item.title}</Text> : null}
        </View>
      );
      break;
    case 'product':
      body = (
        <View>
          {img}
          <View style={{ padding: pad, gap: 2 }}>
            {item.title ? <Text size="sm" weight={500} numberOfLines={2}>{item.title}</Text> : null}
            {typeof meta.price === 'string' || typeof meta.price === 'number' ? <Text size="sm" mono>{String(meta.price)}</Text> : null}
            {domain}
          </View>
        </View>
      );
      break;
    default: // article, link, pdf, book, recipe, tweet, repo, file
      body = (
        <View>
          {img ?? (
            <View style={{ width, height: Math.round(width * 0.6), backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text size="display" color="text3">{(item.domain ?? item.title ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ padding: pad, gap: 2 }}>
            <Text size="sm" weight={500} numberOfLines={2}>{item.title ?? item.url ?? 'Untitled'}</Text>
            {domain}
          </View>
        </View>
      );
  }

  const Wrap = fresh ? Animated.View : View;
  return (
    <Wrap entering={fresh ? FadeIn.duration(motion.base) : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title ?? item.type}
        accessibilityState={{ selected }}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => ({ width, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 })}
      >
        {body}
        {showTrace ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 8, bottom: 8 }}>
            <Trace size={12} opacity={trace.minOpacity + strength * (trace.maxOpacity - trace.minOpacity)} color={uri && item.type === 'image' ? '#FFFFFF' : c.text} />
          </View>
        ) : null}
        {selecting ? (
          <View style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, borderWidth: selected ? 0 : 1.5, borderColor: c.line, backgroundColor: selected ? c.accent : c.surface, alignItems: 'center', justifyContent: 'center' }}>
            {selected ? <Text size="xs" weight={600} style={{ color: dark ? c.bg : '#FFFFFF' }}>{'✓'}</Text> : null}
          </View>
        ) : null}
      </Pressable>
    </Wrap>
  );
}

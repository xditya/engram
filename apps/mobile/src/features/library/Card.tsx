import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Trace } from '../../icons/Icon';
import { useTheme } from '../../theme/useTheme';
import { Fade, Text } from '../../ui';
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
  const media = item.type === 'image' || item.type === 'video';
  const bottom = showTrace && !media ? pad + 14 : pad; // text cards leave room for the trace at left 12 / bottom 10

  const img = uri
    ? <Image source={{ uri }} style={{ width, height: Math.round(width * ratio), backgroundColor: c.surface2 }} contentFit="cover" accessibilityIgnoresInvertColors />
    : null;
  const block = (h: number) => <View style={{ width, height: Math.round(width * h), backgroundColor: c.surface2 }} />;
  // Article thumb: inset 12 px inside the card, 84 px high, radius 6.
  const inset = uri
    ? <Image source={{ uri }} style={{ width: width - pad * 2, height: 84, borderRadius: radius.sm, backgroundColor: c.surface2, marginBottom: 4 }} contentFit="cover" accessibilityIgnoresInvertColors />
    : null;
  const domain = item.domain ? <Text size="xs" mono color="text3" numberOfLines={1} style={{ fontSize: 11 }}>{item.domain}</Text> : null;
  const title = (t: string) => <Text size="sm" weight={500} numberOfLines={2} style={{ lineHeight: 18 }}>{t}</Text>;

  let body: ReactNode;
  switch (item.type) {
    case 'image':
      body = img ?? block(1);
      break;
    case 'note':
      body = (
        <View style={{ paddingHorizontal: pad, paddingTop: pad, paddingBottom: bottom }}>
          <Text size="sm" lineHeight="body" numberOfLines={6} style={{ fontSize: 13 }}>{item.body ?? item.title ?? ''}</Text>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: bottom, height: 18 }}><Fade color={c.surface} solidAt={1} /></View>
        </View>
      );
      break;
    case 'quote':
      body = (
        <View style={{ paddingHorizontal: pad, paddingTop: pad, paddingBottom: bottom }}>
          <Text weight={600} style={{ fontSize: 24, lineHeight: 16 }}>{'“'}</Text>
          <Text size="sm" style={{ lineHeight: 20, marginTop: 6 }}>{item.body ?? item.title ?? ''}</Text>
          {item.domain || item.title ? <Text size="xs" mono color="text3" numberOfLines={1} style={{ fontSize: 11, marginTop: 6 }}>{item.domain ?? item.title}</Text> : null}
        </View>
      );
      break;
    case 'video':
      body = (
        <View>
          {img ?? block(0.56)}
          {typeof meta.duration === 'number' ? (
            <View style={{ position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: dark ? 'rgba(237,239,242,0.14)' : 'rgba(21,23,26,0.82)' }}>
              <Text size="xs" mono style={{ fontSize: 10, lineHeight: 13, color: dark ? c.text : c.surface }}>{duration(meta.duration)}</Text>
            </View>
          ) : null}
        </View>
      );
      break;
    case 'product':
      body = (
        <View>
          {img}
          <View style={{ paddingHorizontal: pad, paddingTop: pad, paddingBottom: bottom, gap: 6 }}>
            {item.title ? title(item.title) : null}
            <Text size="xs" mono color="text3" numberOfLines={1} style={{ fontSize: 11 }}>
              {typeof meta.price === 'string' || typeof meta.price === 'number' ? <Text size="xs" mono style={{ fontSize: 11 }}>{String(meta.price)}{item.domain ? ' · ' : ''}</Text> : null}
              {item.domain}
            </Text>
          </View>
        </View>
      );
      break;
    default: // article, link, pdf, book, recipe, tweet, repo, file: thumb inset when there is one, text-only otherwise
      body = (
        <View style={{ paddingHorizontal: pad, paddingTop: pad, paddingBottom: bottom, gap: 6 }}>
          {inset}
          {title(item.title ?? item.url ?? 'Untitled')}
          {domain}
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
          <View pointerEvents="none" style={{ position: 'absolute', left: media ? 8 : pad, bottom: media ? 8 : 10 }}>
            <Trace size={12} opacity={trace.minOpacity + strength * (trace.maxOpacity - trace.minOpacity)} color={uri && media ? (dark ? c.text : c.surface) : c.text} />
          </View>
        ) : null}
        {selecting ? (
          <View style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, borderWidth: selected ? 0 : 1.5, borderColor: c.line, backgroundColor: selected ? c.accent : c.surface, alignItems: 'center', justifyContent: 'center' }}>
            {selected ? <Text size="xs" weight={600} style={{ color: dark ? c.bg : c.surface }}>{'✓'}</Text> : null}
          </View>
        ) : null}
      </Pressable>
    </Wrap>
  );
}

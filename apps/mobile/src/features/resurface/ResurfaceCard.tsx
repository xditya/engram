import { View } from 'react-native';
import { Image } from 'expo-image';
import { db as coreDb, notes, type Item } from '@engram/core';
import { Trace } from '../../icons/Icon';
import { useEngram, useLiveQuery } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import { shortDate } from '../library/format';
import { thumbOf } from '../spaces/thumb';

const DAY = 86_400_000;
export function untouched(item: Item, now: number): string {
  const last = Math.max(item.created_at, item.opened_at ?? 0, item.resurfaced_at ?? 0);
  const d = Math.floor((now - last) / DAY);
  const [n, unit] = d >= 365 ? [Math.floor(d / 365), 'year'] : d >= 30 ? [Math.floor(d / 30), 'month'] : d >= 7 ? [Math.floor(d / 7), 'week'] : [Math.max(d, 1), 'day'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

// One card of the deck: image on top when there is one, then title, a line of text, tags, and the reason it is
// here. `height` is fixed by the deck so the cards behind line up whatever their content.
export function ResurfaceCard({ item, height }: { item: Item; height: number }) {
  const { c, radius, space } = useTheme();
  const { engram } = useEngram();
  const now = Date.now();
  const thumb = engram ? thumbOf(engram, item) : null;
  const tags = useLiveQuery((e) => e.db.tags.of(item.id), [item.id]) ?? [];
  const text = item.type === 'note' || item.type === 'quote' ? notes.markdownToPlain(item.body ?? '') : item.summary ?? item.body;
  const imageH = thumb ? Math.round(height * 0.58) : 0;
  return (
    <View style={{ height, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      {thumb ? <Image source={{ uri: thumb.uri }} style={{ width: '100%', height: imageH, backgroundColor: c.surface2 }} contentFit="cover" /> : null}
      <View style={{ flex: 1, padding: space[4], gap: space[2] }}>
        {item.type === 'quote' ? <Text size="xl" color="text3" style={{ lineHeight: 20 }}>{'“'}</Text> : null}
        {item.title ? <Text size="lg" weight={600} numberOfLines={thumb ? 2 : 3}>{item.title}</Text> : null}
        {text ? <Text size="sm" color="text2" numberOfLines={thumb ? 3 : 8} lineHeight="body">{text}</Text> : null}
        {tags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, maxHeight: 30, overflow: 'hidden' }}>
            {tags.slice(0, 5).map((t) => <View key={t} style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: c.line }}><Text size="xs" color="text2">{t}</Text></View>)}
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Trace size={14} opacity={Math.max(0.25, coreDb.traceStrength(item, now))} />
          <Text size="xs" mono color="text3" numberOfLines={1} style={{ flex: 1 }}>{item.domain ? `${item.domain} · ` : ''}saved {shortDate(item.created_at)} · untouched {untouched(item, now)}</Text>
        </View>
      </View>
    </View>
  );
}

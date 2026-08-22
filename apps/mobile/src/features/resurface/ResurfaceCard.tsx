import { View } from 'react-native';
import { Image } from 'expo-image';
import { db as coreDb, type Item } from '@engram/core';
import { Trace } from '../../icons/Icon';
import { useEngram } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import { shortDate } from '../library/format';
import { thumbOf } from '../spaces/thumb';

const DAY = 86_400_000;
function untouched(item: Item, now: number): string {
  const last = Math.max(item.created_at, item.opened_at ?? 0, item.resurfaced_at ?? 0);
  const d = Math.floor((now - last) / DAY);
  const [n, unit] = d >= 365 ? [Math.floor(d / 365), 'year'] : d >= 30 ? [Math.floor(d / 30), 'month'] : d >= 7 ? [Math.floor(d / 7), 'week'] : [Math.max(d, 1), 'day'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function ResurfaceCard({ item }: { item: Item }) {
  const { c, radius, space } = useTheme();
  const { engram } = useEngram();
  const now = Date.now();
  const thumb = engram ? thumbOf(engram, item) : null;
  const text = item.type === 'note' || item.type === 'quote' ? item.body : null;
  return (
    <View style={{ alignItems: 'center', gap: space[3] }}>
      <View style={{ width: '100%', backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden' }}>
        {thumb ? (
          <Image source={{ uri: thumb.uri }} style={{ width: '100%', aspectRatio: thumb.row.w && thumb.row.h ? Math.max(0.6, thumb.row.w / thumb.row.h) : 1.5 }} contentFit="cover" />
        ) : null}
        {item.title || text || item.domain ? (
          <View style={{ padding: space[4], gap: space[2] }}>
            {item.type === 'quote' ? <Text size="xl" color="text3">{'“'}</Text> : null}
            {item.title ? <Text size="lg" weight={500}>{item.title}</Text> : null}
            {text && !item.title ? <Text size="sm" numberOfLines={10}>{text}</Text> : null}
            {item.domain ? <Text size="xs" mono color="text3">{item.domain}</Text> : null}
          </View>
        ) : null}
      </View>
      <Text size="xs" mono color="text3">{`saved ${shortDate(item.created_at)} · untouched for ${untouched(item, now)}`}</Text>
      <Trace size={14} opacity={Math.max(0.25, coreDb.traceStrength(item, now))} />
    </View>
  );
}

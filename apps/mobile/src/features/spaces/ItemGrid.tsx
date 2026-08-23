import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { db as coreDb, type Item } from '@engram/core';
import { Card } from '../library/Card';
import { ListRow } from '../library/ListRow';
import type { Entry } from '../library/useLibrary';
import { gridLayout } from '../library/format';
import { engram, useSettings } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Hairline } from '../../ui';
import { thumbOf } from './thumb';

const PAD = 16;

export function toEntry(item: Item): Entry {
  const e = engram();
  const t = thumbOf(e, item);
  return { item, thumb: t?.row, uri: t?.uri, strength: coreDb.traceStrength(item, e.platform.now()) };
}

// The Library's grid/list, reduced to what a filtered view needs (no selection, no paging).
export function ItemGrid({ entries, header, onOpen }: { entries: Entry[]; header?: React.ReactElement; onOpen?: (id: string) => void }) {
  const { space } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const ui = useSettings((s) => s.ui);
  const grid = ui.view === 'grid';
  const { cols, gutter, colW, dense } = gridLayout(ui.density, width, PAD);
  const open = (id: string) => { onOpen?.(id); router.push(`/card/${id}`); }; // the detail screen records the open
  return (
    <FlashList
      key={`${grid ? 'g' : 'l'}${cols}`}
      data={entries}
      masonry={grid}
      numColumns={grid ? cols : 1}
      keyExtractor={(e) => e.item.id}
      extraData={[ui.traceIndicator, dense]}
      ListHeaderComponent={header}
      ItemSeparatorComponent={grid ? undefined : Hairline}
      contentContainerStyle={{ paddingHorizontal: grid ? PAD - gutter / 2 : PAD, paddingBottom: space[7] }}
      renderItem={({ item: e, index }) => {
        const props = { entry: e, selecting: false, selected: false, onPress: () => open(e.item.id), onLongPress: () => {} };
        if (!grid) {
          const first = index === 0, last = index === entries.length - 1;
          return (
            <View style={{ overflow: 'hidden', borderTopLeftRadius: first ? 14 : 0, borderTopRightRadius: first ? 14 : 0, borderBottomLeftRadius: last ? 14 : 0, borderBottomRightRadius: last ? 14 : 0 }}>
              <ListRow {...props} dense={dense} />
            </View>
          );
        }
        return (
          <View style={{ padding: gutter / 2 }}>
            <Card {...props} width={colW} showTrace={ui.traceIndicator && !dense} fresh={false} />
          </View>
        );
      }}
    />
  );
}

import { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Icon, Trace } from '../../icons/Icon';
import { engram, useEngram, useSettings, useToast } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Chip, Hairline, Row, Screen, Sheet, Text } from '../../ui';
import { Card } from './Card';
import { ListRow } from './ListRow';
import { PinnedStrip } from './PinnedStrip';
import { ResurfaceRow } from './ResurfaceRow';
import { SelectBar } from './SelectBar';
import { useLibrary, useSortSetting, type Entry, type Sort } from './useLibrary';
import { usePasteChip } from './usePasteChip';
import { SHARE_TIP, useIntelligenceNudge, useShareTip } from '../onboarding';

const SORTS: [Sort, string][] = [['saved', 'Date saved'], ['opened', 'Last opened'], ['type', 'Type'], ['title', 'Title']];
const PAD = 16;

export function LibraryScreen() {
  const { c, dark, space, radius } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { error } = useEngram();
  const ui = useSettings((s) => s.ui);
  const patch = useSettings((s) => s.patch);
  const show = useToast((s) => s.show);
  const [sort, setSort] = useSortSetting();
  const { entries, pinned, count, more } = useLibrary(sort);
  // Sort chips stay out of the way: hidden at the top, revealed when the user scrolls back up, hidden again on scroll down.
  const [showSort, setShowSort] = useState(false);
  const lastY = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y < 40) { if (showSort) setShowSort(false); return; }
    if (dy < -6 && !showSort) setShowSort(true);
    else if (dy > 6 && showSort) setShowSort(false);
  };
  const paste = usePasteChip();
  const nudge = useIntelligenceNudge();
  const tip = useShareTip();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [menu, setMenu] = useState(false);
  const list = useRef<FlashListRef<Entry>>(null);
  const mountedAt = useRef(Date.now());

  const dense = ui.density === 'compact';
  const cols = dense ? 3 : 2;
  const gutter = dense ? 4 : 8;
  const colW = Math.floor((width - PAD * 2 - gutter * (cols - 1)) / cols);
  const grid = ui.view === 'grid';

  const open = (id: string) => router.push(`/card/${id}`); // the detail screen records the open
  const toggle = (id: string) => {
    void Haptics.selectionAsync();
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const press = (id: string) => (selected ? toggle(id) : open(id));
  const longPress = (id: string) => { if (!selected) toggle(id); };
  const savePaste = () => {
    const url = paste.url; if (!url) return;
    paste.dismiss();
    engram().capture.saveUrl(url).then(() => show('Saved')).catch((e) => show(`Couldn't save: ${(e as Error).message}`));
  };

  const header = (
    <View>
      {tip.visible ? (
        <Pressable onPress={tip.dismiss} style={{ marginHorizontal: space[4], marginBottom: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: c.surface }}>
          <Text size="sm" color="text2">{SHARE_TIP}</Text>
        </Pressable>
      ) : null}
      {nudge.visible ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: space[2] }}>
          <View style={{ flex: 1 }}><Row title={nudge.text} onPress={nudge.open} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={nudge.dismiss} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text color="text2">✕</Text></Pressable>
        </View>
      ) : null}
      <ResurfaceRow count={count} onPress={() => router.push('/resurface')} />
      <PinnedStrip pinned={pinned} onPress={open} />
    </View>
  );

  const sortBar = showSort ? (
    <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(160)} style={{ flexDirection: 'row', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2], backgroundColor: c.bg }}>
      {SORTS.map(([k, label]) => <Chip key={k} label={label} active={sort === k} onPress={() => setSort(k)} />)}
    </Animated.View>
  ) : null;

  const empty = error ? (
    <View style={{ alignItems: 'center', paddingTop: 120, paddingHorizontal: space[6], gap: space[4] }}>
      <Text size="lg" weight={500}>Database unavailable</Text>
      <Text size="sm" color="text2" mono style={{ textAlign: 'center' }}>{error.message}</Text>
    </View>
  ) : (
    <View style={{ alignItems: 'center', paddingTop: 120, paddingHorizontal: space[6], gap: space[4] }}>
      <Trace size={48} opacity={0.3} color={c.accent} />
      <Text size="lg" weight={500}>Nothing here yet.</Text>
      <Text size="sm" color="text2" style={{ textAlign: 'center' }}>Share something to engram from any app, or tap +.</Text>
    </View>
  );

  const iconButton = (name: Parameters<typeof Icon>[0]['name'], label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} />
    </Pressable>
  );

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: space[4], paddingRight: space[1] }}>
        <Pressable accessibilityRole="header" onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <Text weight={600} style={{ fontSize: 17 }}>engram</Text>
        </Pressable>
        {selected ? (
          <Pressable accessibilityRole="button" onPress={() => setSelected(null)} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[3] }}>
            <Text size="sm" weight={500} color="accent">Done</Text>
          </Pressable>
        ) : (
          <>
            {iconButton('spaces', 'Spaces', () => router.push('/spaces'))}
            {iconButton(grid ? 'view-list' : 'view-grid', grid ? 'List view' : 'Grid view', () => patch('ui', { view: grid ? 'list' : 'grid' }))}
            <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenu(true)} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text size="lg" color="text2" style={{ letterSpacing: 1 }}>···</Text>
            </Pressable>
          </>
        )}
      </View>

      {sortBar}
      <FlashList
        ref={list}
        key={`${grid ? 'g' : 'l'}${cols}`}
        data={entries}
        masonry={grid}
        numColumns={grid ? cols : 1}
        keyExtractor={(e) => e.item.id}
        extraData={[selected, ui.traceIndicator, dense]}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        onEndReached={more}
        onEndReachedThreshold={1}
        onScrollBeginDrag={paste.dismiss}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={grid
          ? { paddingHorizontal: PAD - gutter / 2, paddingBottom: 140 }
          : { paddingHorizontal: PAD, paddingBottom: 140 }}
        ItemSeparatorComponent={grid ? undefined : Hairline}
        renderItem={({ item: e, index }) => {
          const id = e.item.id;
          const props = { entry: e, selecting: !!selected, selected: !!selected?.has(id), onPress: () => press(id), onLongPress: () => longPress(id) };
          if (!grid) {
            const first = index === 0; const last = index === entries.length - 1;
            return (
              <View style={{ overflow: 'hidden', borderTopLeftRadius: first ? 14 : 0, borderTopRightRadius: first ? 14 : 0, borderBottomLeftRadius: last ? 14 : 0, borderBottomRightRadius: last ? 14 : 0 }}>
                <ListRow {...props} dense={dense} />
              </View>
            );
          }
          return (
            <View style={{ padding: gutter / 2 }}>
              <Card {...props} width={colW} showTrace={ui.traceIndicator && !dense} fresh={e.item.created_at > mountedAt.current} />
            </View>
          );
        }}
      />

      {selected ? (
        <SelectBar ids={[...selected]} onDone={() => setSelected(null)} />
      ) : (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingBottom: space[4], gap: space[2] }} pointerEvents="box-none">
          {paste.url ? (
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingLeft: space[3], borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
              <Text size="sm" color="text2">Clipboard has a link — </Text>
              <Pressable accessibilityRole="button" onPress={savePaste} style={{ minHeight: 40, paddingHorizontal: space[3], justifyContent: 'center' }}>
                <Text size="sm" weight={500} color="accent">Save</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Pressable
              accessibilityRole="search"
              onPress={() => router.push('/search')}
              style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, justifyContent: 'center', paddingHorizontal: space[4] }}
            >
              <Text size="md" color="text3">Search</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add"
              onPress={() => router.push('/capture')}
              style={({ pressed }) => ({ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ fontSize: 28, lineHeight: 32, color: dark ? c.bg : '#FFFFFF' }}>+</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <Row title="Resurface" onPress={() => { setMenu(false); router.push('/resurface'); }} />
        <Hairline />
        <Row title="Select" onPress={() => { setMenu(false); setSelected(new Set()); }} />
        <Hairline />
        <Row title="Density" value={dense ? 'Dense' : 'Normal'} onPress={() => patch('ui', { density: dense ? 'cozy' : 'compact' })} />
        <Hairline />
        <Row title="Settings" onPress={() => { setMenu(false); router.push('/settings'); }} />
      </Sheet>
    </Screen>
  );
}

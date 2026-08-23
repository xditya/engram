import { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { Easing, FadeInUp, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Icon, Trace } from '../../icons/Icon';
import { engram, useEngram, useSettings, useToast } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Chip, Fade, Hairline, Row, Screen, Sheet, Text } from '../../ui';
import { Card } from './Card';
import { gridLayout } from './format';
import { ListRow } from './ListRow';
import { PinnedStrip } from './PinnedStrip';
import { ResurfaceRow } from './ResurfaceRow';
import { SelectBar } from './SelectBar';
import { useLibrary, useSortSetting, type Entry, type Sort } from './useLibrary';
import { usePasteChip } from './usePasteChip';
import { SHARE_TIP, useIntelligenceNudge, useShareTip } from '../onboarding';

const SORTS: [Sort, string][] = [['saved', 'Date saved'], ['opened', 'Last opened'], ['type', 'Type'], ['title', 'Title']];
const PAD = 16;
type Density = 'comfortable' | 'cozy' | 'compact';
const DENSITY: Record<Density, { label: string; next: Density }> = {
  comfortable: { label: 'Comfortable', next: 'cozy' }, cozy: { label: 'Normal', next: 'compact' }, compact: { label: 'Dense', next: 'comfortable' },
};

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
  const paste = usePasteChip();
  const nudge = useIntelligenceNudge();
  const tip = useShareTip();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [menu, setMenu] = useState(false);
  const list = useRef<FlashListRef<Entry>>(null);
  // Sort chips: list view shows them always; in the grid they appear the first time the user scrolls back up, then stay.
  const [showSort, setShowSort] = useState(false);
  const [fits, setFits] = useState(false);
  const size = useRef({ content: 0, frame: 0 });
  const measure = () => setFits(size.current.frame > 0 && size.current.content <= size.current.frame);
  // The search field folds into the + button on scroll down; scroll up or a tap on the button unfolds it.
  const lastY = useRef(0);
  const folded = useRef(false);
  const collapse = useSharedValue(0);
  const fold = (v: boolean) => { folded.current = v; collapse.value = withTiming(v ? 1 : 0, { duration: 240, easing: Easing.out(Easing.cubic) }); };
  const { width: winW } = useWindowDimensions();
  const searchW = winW - space[4] * 2 - 56 - space[3];
  const searchStyle = useAnimatedStyle(() => ({
    width: interpolate(collapse.value, [0, 1], [searchW, 0]),
    opacity: interpolate(collapse.value, [0, 0.6, 1], [1, 0, 0]),
    transform: [{ translateX: interpolate(collapse.value, [0, 1], [0, 24]) }],
  }));
  const plusStyle = useAnimatedStyle(() => ({ opacity: interpolate(collapse.value, [0, 0.5], [1, 0]), transform: [{ rotate: `${interpolate(collapse.value, [0, 1], [0, 90])}deg` }] }));
  const bandStyle = useAnimatedStyle(() => ({ opacity: interpolate(collapse.value, [0, 1], [1, 0]) })); // the band goes with the field
  const markStyle = useAnimatedStyle(() => ({ opacity: interpolate(collapse.value, [0.5, 1], [0, 1]), transform: [{ scale: interpolate(collapse.value, [0.5, 1], [0.6, 1]) }] }));
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (!showSort && y > 40 && dy < -8) setShowSort(true);
    const atEnd = y >= size.current.content - size.current.frame - 48; // the end-of-list bounce must not read as a scroll up
    if (dy > 8 && y > 80 && !folded.current) fold(true);
    else if (dy < -8 && folded.current && !atEnd) fold(false);
  };
  const mountedAt = useRef(Date.now());

  const { cols, gutter, colW, dense } = gridLayout(ui.density, width, PAD);
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

  // Sort chips sit above the list (not inside it), so re-sorting never scrolls or re-lays out the header.
  const sortBar = !grid || showSort || fits ? (
    <Animated.View entering={grid ? FadeInUp.duration(200) : undefined} style={{ flexDirection: 'row', gap: space[2], paddingHorizontal: space[4], paddingBottom: space[2] }}>
      {SORTS.map(([k, label]) => <Chip key={k} label={label} active={sort === k} onPress={() => setSort(k)} />)}
    </Animated.View>
  ) : null;

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

  // 20 px glyphs 16 px apart; the 44 pt target comes from hitSlop, not from the box.
  const iconButton = (name: Parameters<typeof Icon>[0]['name'], label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={12} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} />
    </Pressable>
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, paddingHorizontal: space[4], gap: space[4] }}>
        <Pressable accessibilityRole="header" focusable={false} onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} style={{ flex: 1, justifyContent: 'center' }}>
          <Text weight={600} style={{ fontSize: 17 }}>engram</Text>
        </Pressable>
        {selected ? (
          <Pressable accessibilityRole="button" onPress={() => setSelected(null)} hitSlop={12} style={{ justifyContent: 'center' }}>
            <Text size="sm" weight={500} color="accent">Done</Text>
          </Pressable>
        ) : (
          <>
            {iconButton('spaces', 'Spaces', () => router.push('/spaces'))}
            {iconButton(grid ? 'view-list' : 'view-grid', grid ? 'List view' : 'Grid view', () => patch('ui', { view: grid ? 'list' : 'grid' }))}
            <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenu(true)} hitSlop={12} style={{ height: 20, justifyContent: 'center' }}>
              <Text color="text2" style={{ fontSize: 16, lineHeight: 20, letterSpacing: 2 }}>···</Text>
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
        onContentSizeChange={(_, h) => { size.current.content = h; measure(); }}
        onLayout={(e) => { size.current.frame = e.nativeEvent.layout.height; measure(); }}
        contentContainerStyle={grid
          ? { paddingHorizontal: PAD - gutter / 2, paddingBottom: 140 }
          : { paddingHorizontal: 12, paddingBottom: 140 }}
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
              <Card {...props} width={colW} showTrace={ui.traceIndicator} fresh={e.item.created_at > mountedAt.current} />
            </View>
          );
        }}
      />

      {selected ? (
        <SelectBar ids={[...selected]} onDone={() => setSelected(null)} />
      ) : (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 24, paddingHorizontal: space[4], paddingBottom: space[4], gap: space[2] }} pointerEvents="box-none">
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, bandStyle]}><Fade color={c.bg} /></Animated.View>
          {paste.url ? (
            <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingLeft: space[3], paddingVertical: 7, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
              <Text size="xs" style={{ fontSize: 13 }}>Clipboard has a link — </Text>
              <Pressable accessibilityRole="button" onPress={savePaste} hitSlop={8} style={{ paddingHorizontal: space[3], justifyContent: 'center' }}>
                <Text size="xs" weight={500} color="accent" style={{ fontSize: 13 }}>Save</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space[3] }}>
            <Animated.View style={[{ height: 46, overflow: 'hidden' }, searchStyle]}>
              <Pressable
                accessibilityRole="search"
                onPress={() => router.push('/search')}
                style={{ width: searchW, height: 46, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, justifyContent: 'center', paddingHorizontal: space[4] }}
              >
                <Text size="sm" color="text3">Search your library</Text>
              </Pressable>
            </Animated.View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={folded.current ? 'Search or add' : 'Add'}
              onPress={() => { if (folded.current) fold(false); else router.push('/capture'); }}
              style={({ pressed }) => ({ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
            >
              <Animated.View style={[{ position: 'absolute' }, plusStyle]}>
                <Text style={{ fontSize: 26, lineHeight: 26, color: dark ? c.bg : c.surface }}>+</Text>
              </Animated.View>
              <Animated.View style={[{ position: 'absolute' }, markStyle]}>
                <Trace size={26} color={dark ? c.bg : c.surface} />
              </Animated.View>
            </Pressable>
          </View>
        </View>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <Row title="Resurface" onPress={() => { setMenu(false); router.push('/resurface'); }} />
        <Hairline />
        <Row title="Select" onPress={() => { setMenu(false); setSelected(new Set()); }} />
        <Hairline />
        <Row title="Density" value={DENSITY[ui.density].label} onPress={() => patch('ui', { density: DENSITY[ui.density].next })} />
        <Hairline />
        <Row title="Settings" onPress={() => { setMenu(false); router.push('/settings'); }} />
      </Sheet>
    </Screen>
  );
}

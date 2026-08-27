import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion, runOnJS, useReducedMotion } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import type { Item } from '@engram/core';
import { Trace } from '../../icons/Icon';
import { engram, useLiveQuery } from '../../lib/hub';
import { useToast } from '../../lib/toast';
import { useTheme } from '../../theme/useTheme';
import { Button, Fade, Hairline, HelpTip, Sheet, Text } from '../../ui';
import { textDefaults } from '../../ui/Text';
import { shortDate, traceLine } from './format';
import { openOriginal } from './content';
import { copyItem, shareItem } from './share';

const MAX_PINNED = 5;

const APressable = Animated.createAnimatedComponent(Pressable);

const EASE = Easing.bezier(0.33, 1, 0.68, 1);

// Tags that land later (autotag / classify jobs) fade in like any new save: 200 ms, opacity + 4 pt lift,
// staggered >= 120 ms apart when several arrive in one batch. Reduced motion keeps the fade, drops the lift.
function TagChip({ label, onPress, onLongPress, dashed, accessibilityLabel, accessibilityHint, delay = 0 }: { label: string; onPress: () => void; onLongPress?: () => void; dashed?: boolean; accessibilityLabel?: string; accessibilityHint?: string; delay?: number }) {
  const { c, motion } = useTheme();
  const reduced = useReducedMotion();
  const entering = FadeIn.duration(motion.base).delay(delay).easing(EASE).reduceMotion(ReduceMotion.Never)
    .withInitialValues((reduced ? { opacity: 0 } : { opacity: 0, transform: [{ translateY: 4 }] }) as { opacity: number }); // the builder's type omits transform; the runtime merges any style
  return (
    <APressable entering={entering} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} onPress={onPress} onLongPress={onLongPress} hitSlop={6}
      style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7, justifyContent: 'center', borderWidth: 1, borderColor: c.line, borderStyle: dashed ? 'dashed' : 'solid' }}>
      <Text size="xs">{label}</Text>
    </APressable>
  );
}

// `pending` shows a static "tagging…" until the first chip lands; `compact` drops the vertical padding.
export function Tags({ item, tags, pending, compact }: { item: Item; tags: string[]; pending?: boolean; compact?: boolean }) {
  const { c, space } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const seen = useRef(new Set(tags));
  const fresh = tags.filter((t) => !seen.current.has(t));
  useEffect(() => { seen.current = new Set(tags); });
  const all = useLiveQuery((e) => e.db.tags.all().map((t) => t.tag), []) ?? [];
  const q = (draft ?? '').trim().toLowerCase();
  const hints = q ? all.filter((t) => t.toLowerCase().startsWith(q) && !tags.includes(t)).slice(0, 6) : [];
  const add = (t: string) => { const v = t.trim(); if (v) engram().db.tags.add(item.id, v); setDraft(null); };
  // A tap never destroys: it searches the tag. Removing is a long press, and comes with Undo.
  const show = useToast((s) => s.show);
  const remove = (t: string) => {
    engram().db.tags.remove(item.id, t);
    show(`Removed "${t}"`, 5000, { label: 'Undo', onPress: () => engram().db.tags.add(item.id, t) });
  };
  const open = (t: string) => router.push({ pathname: '/search', params: { q: `tag:${t}` } } as never);
  return (
    <View style={{ paddingVertical: compact ? 0 : space[3], gap: space[2] }}>
      {/* ponytail: compact (share sheet) clips to one chip row to keep the sheet short; a horizontal scroll or +N overflow is the upgrade */}
      <View accessibilityLiveRegion="polite" accessibilityLabel={tags.length ? `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}: ${tags.join(', ')}` : undefined}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', maxHeight: compact ? 30 : undefined, overflow: 'hidden' }}>
        {tags.map((t) => <TagChip key={t} label={t} delay={Math.max(0, fresh.indexOf(t)) * 120} accessibilityLabel={`Tag ${t}`} accessibilityHint={compact ? 'Double tap to remove' : 'Double tap to search this tag, double tap and hold to remove'} onPress={() => (compact ? remove(t) : open(t))} onLongPress={() => remove(t)} />)}
        {pending && !tags.length ? <Animated.View exiting={FadeOut.duration(120)}><Text size="xs" mono color="text3">tagging…</Text></Animated.View> : null}
        {draft === null ? (
          <TagChip label="+ tag" dashed accessibilityLabel="Add tag" onPress={() => setDraft('')} />
        ) : (
          <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => add(draft)}
            onBlur={() => { if (!draft.trim()) setDraft(null); }}
            placeholder="tag"
            placeholderTextColor={c.text3}
            autoCapitalize="none"
            accessibilityLabel="New tag"
            style={{ paddingVertical: 4, minWidth: 96, paddingHorizontal: 9, borderRadius: 7, borderWidth: 1, borderColor: c.accent, color: c.text, fontFamily: 'Geist', fontSize: 12 }}
          />
        )}
      </View>
      {hints.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {hints.map((t) => (
            <Pressable key={t} accessibilityRole="button" onPress={() => add(t)} style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 7, backgroundColor: c.accentSoft }}>
              <Text size="xs" color="accent">{t}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// "Spaces" label + one toggle chip per Space. Renders nothing when there are no Spaces.
export function SpaceChips({ itemId, before }: { itemId: string; before?: React.ReactNode }) {
  const { c, space } = useTheme();
  const spaces = useLiveQuery((e) => e.db.spaces.list(), []) ?? [];
  const inSpaces = useLiveQuery((e) => new Set(
    e.platform.db.query<{ space_id: string }>('SELECT space_id FROM space_items WHERE item_id = ? AND deleted_at IS NULL', [itemId]).map((r) => r.space_id),
  ), [itemId]) ?? new Set<string>();
  const toggle = (id: string) => { const { db } = engram(); inSpaces.has(id) ? db.spaces.removeItem(id, itemId) : db.spaces.addItem(id, itemId); };
  if (!spaces.length) return null;
  return (
    <>
      {before}
      <View style={{ paddingVertical: space[3], gap: space[2] }}>
        <Text size="sm">Spaces</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {spaces.map((s) => {
            const on = inSpaces.has(s.id);
            return (
              <Pressable key={s.id} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={s.name} onPress={() => toggle(s.id)}
                style={{ height: 32, paddingHorizontal: 12, borderRadius: 7, justifyContent: 'center', backgroundColor: on ? c.accentSoft : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.line }}>
                <Text size="xs" color={on ? 'accent' : 'text2'}>{s.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

// A drawn chevron (two short bars), because the ⌃ glyph sits badly in every font we ship.
function Chevron({ color, down }: { color: string; down?: boolean }) {
  const bar = { position: 'absolute' as const, width: 9, height: 2, borderRadius: 1, backgroundColor: color };
  return (
    <View style={{ width: 14, height: 10, justifyContent: 'center' }}>
      <View style={[bar, { left: 0, transform: [{ rotate: down ? '45deg' : '-45deg' }] }]} />
      <View style={[bar, { right: 0, transform: [{ rotate: down ? '-45deg' : '45deg' }] }]} />
    </View>
  );
}

function RowLine({ children, onPress, label }: { children: React.ReactNode; onPress?: () => void; label?: string }) {
  const { space } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} onPress={onPress} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: space[3] }}>
      {children}
    </Pressable>
  );
}

export function MetaBar({ item, onDismiss }: { item: Item; onDismiss: () => void }) {
  const { c, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const show = useToast((s) => s.show);
  const [open, setOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const tags = useLiveQuery((e) => e.db.tags.of(item.id), [item.id]) ?? [];
  const pinnedCount = useLiveQuery((e) => e.db.items.list({ view: 'pinned' }).length, []) ?? 0;
  const pinned = item.pinned_at != null;
  const pinFull = !pinned && pinnedCount >= MAX_PINNED;
  const trace = traceLine(item);
  const line = `${item.type} · saved ${shortDate(item.created_at)} · ${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}`;

  const togglePin = () => { const { db } = engram(); pinned ? db.items.unpin(item.id) : db.items.pin(item.id); };
  const [confirmLetGo, setConfirmLetGo] = useState(false);
  useEffect(() => { if (!confirmLetGo) return; const t = setTimeout(() => setConfirmLetGo(false), 4000); return () => clearTimeout(t); }, [confirmLetGo]);
  const letGo = () => {
    if (!confirmLetGo) return setConfirmLetGo(true); // second tap within 4 s confirms
    engram().db.items.letGo(item.id); onDismiss();
    show('Let go · shake to undo', 5000, { label: 'Undo', shake: true, onPress: () => engram().db.items.restore(item.id) });
  };

  // Bottom action bar: Open (the thing people reach for), Copy, Share, and the details sheet. The sheet is
  // its own gesture target: a swipe down closes it, and the card's own swipe-to-dismiss is off while it is open.
  const nav = useNavigation();
  useEffect(() => { nav.setOptions({ gestureEnabled: !open }); return () => nav.setOptions({ gestureEnabled: true }); }, [nav, open]);
  const copy = () => void copyItem(item).then((what) => show(what ? `${what} copied` : 'Nothing to copy')).catch((e: Error) => show(e.message));
  const share = () => void shareItem(item).catch((e: Error) => { if (!/cancel|dismiss/i.test(e.message)) show(e.message); });
  const pan = Gesture.Pan().activeOffsetY(12).onEnd((e) => { if (e.translationY > 60 || e.velocityY > 800) runOnJS(setOpen)(false); });

  const iconBtn = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ height: 44, paddingHorizontal: space[3], borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.surface, justifyContent: 'center' })}>
      <Text size="sm" weight={500}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      {/* The bar sits on a band that fades the canvas over the content below it, as the library's search bar does. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: space[4], paddingBottom: insets.bottom + space[3] }}>
        <Fade color={c.bg} solidAt={0.55} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        {item.url ? <Button title="Open" height={44} onPress={() => openOriginal(item.url)} style={{ flex: 1 }} /> : null}
        {iconBtn('Copy', copy)}
        {iconBtn('Share', share)}
        <Pressable accessibilityRole="button" accessibilityLabel={`Details: ${line}`} onPress={() => setOpen(true)} style={({ pressed }) => ({ height: 44, minWidth: 44, paddingHorizontal: space[3], borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, flex: item.url ? 0 : 1 })}>
          {item.url ? null : <Text size="xs" mono color="text2" numberOfLines={1} style={{ flexShrink: 1 }}>{line}</Text>}
          <Chevron color={c.text2} />
        </Pressable>
      </View>
      </View>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <GestureDetector gesture={pan}>
          <View style={{ maxHeight: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
              <Text size="xs" mono color="text2" numberOfLines={1} style={{ flex: 1 }}>{line}</Text>
              <HelpTip title="Card details" lines={[
                ['tag', 'Tap a tag to search your library for it. Press and hold to remove it; Undo appears for a few seconds.'],
                ['+ tag', 'Adds a tag. Tags you add teach the model how you file things.'],
                ['trace', 'The small mark fades as a card goes unopened. Opening it strengthens the trace; Resurface brings faded cards back.'],
                ['Spaces', 'Tap a Space to put the card on that shelf, tap again to take it off. A card can sit on several.'],
                ['Pin', 'Keeps the card at the top of the library. Up to five at a time.'],
                ['Let go', 'Moves the card out of the library. It stays recoverable for 30 days under Settings, then is removed from every device.'],
                'Swipe down or tap outside to close this panel; swipe down on the card itself to close the card.',
              ]} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: space[2] }}>
              <Tags item={item} tags={tags} />
              <Hairline />
              {item.summary && item.type !== 'link' ? (
                <>
                  <RowLine onPress={() => setSummaryOpen((v) => !v)} label={summaryOpen ? 'Hide summary' : 'Show summary'}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text size="sm">Summary</Text>
                      <Text size="sm" color="text3">{summaryOpen ? '⌄' : '›'}</Text>
                    </View>
                    {summaryOpen ? <Text size="sm" color="text2" lineHeight="reader" style={{ marginTop: space[2] }}>{item.summary}</Text> : null}
                  </RowLine>
                  <Hairline />
                </>
              ) : null}
              {item.url ? (
                <>
                  <RowLine onPress={() => openOriginal(item.url)} label="Open original">
                    <Text size="xs" mono color="accent" numberOfLines={2}>{item.url.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                  </RowLine>
                  <Hairline />
                </>
              ) : null}
              <RowLine>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <Trace size={12} opacity={Math.max(0.25, trace.strength)} />
                  <Text size="sm">{trace.text}</Text>
                </View>
              </RowLine>
              <SpaceChips itemId={item.id} before={<Hairline />} />
              <Hairline />
              <View style={{ flexDirection: 'row', gap: space[2], paddingTop: space[4] }}>
                <Button title={pinned ? 'Unpin' : pinFull ? `${MAX_PINNED} pinned` : 'Pin'} variant="outline" height={44} disabled={pinFull} onPress={togglePin} style={{ flex: 1 }} />
                <Button title={confirmLetGo ? 'Tap again to let go' : 'Let go'} variant="outline" height={44} danger onPress={letGo} style={{ flex: confirmLetGo ? 2 : 1 }} />
              </View>
            </ScrollView>
          </View>
        </GestureDetector>
      </Sheet>
    </>
  );

}

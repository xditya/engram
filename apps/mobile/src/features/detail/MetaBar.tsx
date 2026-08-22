import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Item } from '@engram/core';
import { Trace } from '../../icons/Icon';
import { engram, useLiveQuery, useToast } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Button, Hairline, Text } from '../../ui';
import { shortDate, traceLine } from './format';
import { openOriginal } from './content';
import { shareItem } from './share';

const MAX_PINNED = 5;

function TagChip({ label, onPress, dashed, accessibilityLabel }: { label: string; onPress: () => void; dashed?: boolean; accessibilityLabel?: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={6}
      style={{ height: 32, paddingHorizontal: 12, borderRadius: 7, justifyContent: 'center', borderWidth: 1, borderColor: c.line, borderStyle: dashed ? 'dashed' : 'solid' }}>
      <Text size="xs" color={dashed ? 'text2' : 'text'}>{label}</Text>
    </Pressable>
  );
}

function Tags({ item, tags }: { item: Item; tags: string[] }) {
  const { c, space } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const all = useLiveQuery((e) => e.db.tags.all().map((t) => t.tag), []) ?? [];
  const q = (draft ?? '').trim().toLowerCase();
  const hints = q ? all.filter((t) => t.toLowerCase().startsWith(q) && !tags.includes(t)).slice(0, 6) : [];
  const add = (t: string) => { const v = t.trim(); if (v) engram().db.tags.add(item.id, v); setDraft(null); };
  return (
    <View style={{ paddingVertical: space[3], gap: space[2] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
        {tags.map((t) => <TagChip key={t} label={t} accessibilityLabel={`Remove tag ${t}`} onPress={() => engram().db.tags.remove(item.id, t)} />)}
        {draft === null ? (
          <TagChip label="+ tag" dashed accessibilityLabel="Add tag" onPress={() => setDraft('')} />
        ) : (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => add(draft)}
            onBlur={() => { if (!draft.trim()) setDraft(null); }}
            placeholder="tag"
            placeholderTextColor={c.text3}
            autoCapitalize="none"
            accessibilityLabel="New tag"
            style={{ height: 32, minWidth: 96, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: c.accent, color: c.text, fontFamily: 'Geist', fontSize: 12 }}
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
  const spaces = useLiveQuery((e) => e.db.spaces.list(), []) ?? [];
  const inSpaces = useLiveQuery((e) => new Set(
    e.platform.db.query<{ space_id: string }>('SELECT space_id FROM space_items WHERE item_id = ? AND deleted_at IS NULL', [item.id]).map((r) => r.space_id),
  ), [item.id]) ?? new Set<string>();
  const pinnedCount = useLiveQuery((e) => e.db.items.list({ view: 'pinned' }).length, []) ?? 0;
  const pinned = item.pinned_at != null;
  const pinFull = !pinned && pinnedCount >= MAX_PINNED;
  const trace = traceLine(item);
  const line = `${item.type} · saved ${shortDate(item.created_at)} · ${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}`;

  const togglePin = () => { const { db } = engram(); pinned ? db.items.unpin(item.id) : db.items.pin(item.id); };
  const letGo = () => { engram().db.items.letGo(item.id); show('Let go · 30 days to recover'); onDismiss(); };
  const toggleSpace = (id: string) => { const { db } = engram(); inSpaces.has(id) ? db.spaces.removeItem(id, item.id) : db.spaces.addItem(id, item.id); };

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${line}. Show details`}
        onPress={() => setOpen(true)}
        style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + space[3], minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}
      >
        <Text size="xs" mono color="text2" numberOfLines={1} style={{ flex: 1 }}>{line}</Text>
        <Text size="sm" color="text3">⌃</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Hide details" onPress={() => setOpen(false)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[2] }}>
        <Text size="xs" mono color="text2" numberOfLines={1} style={{ flex: 1 }}>{line}</Text>
        <Text size="sm" color="text3">⌄</Text>
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: insets.bottom + space[4] }}>
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
              <Text size="xs" mono color="accent" numberOfLines={2}>{item.url}</Text>
            </RowLine>
            <Hairline />
          </>
        ) : null}
        <RowLine>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Trace size={12} opacity={Math.max(0.25, trace.strength)} />
            <Text size="sm" color="text2">{trace.text}</Text>
          </View>
        </RowLine>
        {spaces.length ? (
          <>
            <Hairline />
            <View style={{ paddingVertical: space[3], gap: space[2] }}>
              <Text size="sm">Spaces</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {spaces.map((s) => {
                  const on = inSpaces.has(s.id);
                  return (
                    <Pressable key={s.id} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={s.name} onPress={() => toggleSpace(s.id)}
                      style={{ height: 32, paddingHorizontal: 12, borderRadius: 7, justifyContent: 'center', backgroundColor: on ? c.accentSoft : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.line }}>
                      <Text size="xs" color={on ? 'accent' : 'text2'}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}
        <Hairline />
        <View style={{ flexDirection: 'row', gap: space[2], paddingTop: space[4] }}>
          <Button title={pinned ? 'Unpin' : pinFull ? `${MAX_PINNED} pinned` : 'Pin'} variant="outline" disabled={pinFull} onPress={togglePin} style={{ flex: 1 }} />
          <Button title="Share" variant="outline" onPress={() => void shareItem(item).catch((e: Error) => show(e.message))} style={{ flex: 1 }} />
          <Button title="Let go" variant="outline" danger onPress={letGo} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
}

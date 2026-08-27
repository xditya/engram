import { useEffect, useState } from 'react';
import { textDefaults } from '../../ui/Text';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engram, useLiveQuery, useToast } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Button, Hairline, Row, Sheet, Text } from '../../ui';

type Mode = 'tag' | 'space' | null;

// Bottom action bar for select mode: Tag / Add to Space / Let go. `onDone` leaves select mode.
export function SelectBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { c, space } = useTheme();
  const insets = useSafeAreaInsets();
  const show = useToast((s) => s.show);
  const [mode, setMode] = useState<Mode>(null);
  const [tagText, setTagText] = useState('');
  const spaces = useLiveQuery((e) => e.db.spaces.list(), []) ?? [];
  const n = ids.length;
  const none = n === 0;

  const applyTags = () => {
    const tags = tagText.split(/[\s,#]+/).filter(Boolean);
    if (tags.length) engram().db.transaction(() => { for (const id of ids) for (const t of tags) engram().db.tags.add(id, t); });
    setTagText(''); setMode(null); show(`Tagged ${n}`); onDone();
  };
  const addToSpace = (spaceId: string) => {
    engram().db.transaction(() => { for (const id of ids) engram().db.spaces.addItem(spaceId, id); });
    setMode(null); show(`Added ${n}`); onDone();
  };
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 4000); return () => clearTimeout(t); }, [confirm]);
  useEffect(() => setConfirm(false), [ids.length]);
  const letGo = () => {
    if (!confirm) return setConfirm(true); // second tap within 4 s confirms
    engram().db.transaction(() => { for (const id of ids) engram().db.items.letGo(id); });
    const gone = [...ids]; onDone();
    show(`Let go ${n} · shake to undo`, 5000, { label: 'Undo', shake: true, onPress: () => engram().db.transaction(() => { for (const id of gone) engram().db.items.restore(id); }) });
  };

  // One floating card, like the card detail's action bar: the count on the left, bordered buttons on the right.
  const action = (label: string, onPress: () => void, danger?: boolean, grow?: boolean) => (
    <Pressable accessibilityRole="button" disabled={none} onPress={onPress}
      style={({ pressed }) => ({ height: 40, paddingHorizontal: space[3], borderRadius: 10, borderWidth: 1, borderColor: danger ? c.danger : c.line, backgroundColor: pressed ? c.surface2 : c.surface, alignItems: 'center', justifyContent: 'center', opacity: none ? 0.4 : 1, flexGrow: grow ? 1 : 0 })}>
      <Text size="sm" weight={500} color={danger ? 'danger' : 'text'} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[2], paddingLeft: space[3], borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <Text size="xs" mono color="text2" style={{ flex: 1 }} numberOfLines={1}>{none ? 'Select cards' : `${n} selected`}</Text>
          {action('Tag', () => setMode('tag'))}
          {action('Space', () => setMode('space'))}
          {action(confirm ? `Let go ${n}?` : 'Let go', letGo, true)}
        </View>
      </View>
      <Sheet open={mode === 'tag'} onClose={() => setMode(null)}>
        <Text size="lg" weight={500} style={{ marginBottom: space[3] }}>Tag <Text size="lg" mono color="text3">{n}</Text></Text>
        <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
          autoFocus
          value={tagText}
          onChangeText={setTagText}
          onSubmitEditing={applyTags}
          placeholder="design, reading"
          placeholderTextColor={c.text3}
          autoCapitalize="none"
          style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: c.line, paddingHorizontal: space[3], color: c.text, fontFamily: 'Geist', fontSize: 15, marginBottom: space[3] }}
        />
        <Button title="Apply" onPress={applyTags} disabled={!tagText.trim()} />
      </Sheet>
      <Sheet open={mode === 'space'} onClose={() => setMode(null)}>
        <Text size="lg" weight={500} style={{ marginBottom: space[2] }}>Add to Space</Text>
        {spaces.length ? spaces.map((s, i) => (
          <View key={s.id}>
            {i > 0 ? <Hairline /> : null}
            <Row title={s.name} onPress={() => addToSpace(s.id)} />
          </View>
        )) : <Text size="sm" color="text2" style={{ paddingVertical: space[3] }}>No Spaces yet.</Text>}
      </Sheet>
    </>
  );
}

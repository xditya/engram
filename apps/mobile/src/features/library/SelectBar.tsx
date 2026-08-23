import { useEffect, useState } from 'react';
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
    show(`Let go ${n} · 30 days to recover`); onDone();
  };

  const action = (label: string, onPress: () => void, danger?: boolean) => (
    <Pressable accessibilityRole="button" disabled={none} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: none ? 0.4 : pressed ? 0.7 : 1 })}>
      <Text size="sm" weight={500} color={danger ? 'danger' : 'text'}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2] }}>
          {action('Tag', () => setMode('tag'))}
          {action('Add to Space', () => setMode('space'))}
          {action(confirm ? `Tap again to let go ${n}` : 'Let go', letGo, true)}
        </View>
      </View>
      <Sheet open={mode === 'tag'} onClose={() => setMode(null)}>
        <Text size="lg" weight={500} style={{ marginBottom: space[3] }}>Tag <Text size="lg" mono color="text3">{n}</Text></Text>
        <TextInput
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

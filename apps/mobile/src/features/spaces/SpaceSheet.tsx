import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { Button, Sheet, Text } from '../../ui';

// Create or edit a Space. The query is always shown: a Space is a search you keep.
export function SpaceSheet({ open, initial, onSave, onClose, onDelete }: {
  open: boolean;
  initial?: { name: string; query: string | null };
  onSave: (name: string, query: string) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { c, radius, space, font } = useTheme();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (open) { setName(initial?.name ?? ''); setQuery(initial?.query ?? ''); setConfirming(false); } }, [open, initial]);
  const field = { minHeight: 46, paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.md, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, color: c.text, fontSize: font.size.md } as const;
  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ gap: space[2], paddingTop: space[2] }}>
        <Text size="lg" weight={500}>{initial ? 'Edit Space' : 'New Space'}</Text>
        <Text size="xs" color="text3">Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={c.text3} style={[field, { fontFamily: 'Geist' }]} accessibilityLabel="Space name" />
        <Text size="xs" color="text3">Query</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Query, e.g. tag:design type:article"
          placeholderTextColor={c.text3}
          autoCapitalize="none"
          autoCorrect={false}
          style={[field, { fontFamily: 'GeistMono', fontSize: font.size.sm }]}
          accessibilityLabel="Space query"
        />
        <Text size="xs" color="text2">Cards matching the query appear here, along with any you add by hand.</Text>
        <Button title="Save" disabled={!name.trim()} onPress={() => onSave(name.trim(), query.trim())} />
        {initial && onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={confirming ? 'Confirm delete Space' : 'Delete Space'}
            onPress={() => (confirming ? onDelete() : setConfirming(true))}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text size="sm" weight={500} color="danger">{confirming ? 'Tap again to delete. Cards stay in your library.' : 'Delete Space'}</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

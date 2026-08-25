import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { goHome } from '../../src/lib/nav';
import { Header } from '../../src/features/sync/Header';
import { isWord } from '../../src/features/sync/lib';
import { useEngram, useSettings } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Button, ProgressLine, Screen, Text } from '../../src/ui';

const MAX_TRIES = 3;

export default function Restore() {
  const { c, space, font } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const backend = useSettings((s) => s.sync.backend);
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tries = useRef(0);
  const inputs = useRef<(TextInput | null)[]>([]);

  // A pasted phrase lands in one box; spread it across all twelve.
  const edit = (i: number, raw: string) => {
    const parts = raw.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const next = [...words];
    if (parts.length > 1) parts.slice(0, 12 - i).forEach((w, k) => { next[i + k] = w; });
    else next[i] = raw.toLowerCase().replace(/[^a-z]/g, '');
    setWords(next); setMessage(null);
    if (parts.length > 1) inputs.current[Math.min(11, i + parts.length)]?.focus();
  };

  const complete = words.every((w) => w && isWord(w));

  async function restore() {
    if (!engram || !complete) return;
    setBusy(true); setMessage(null);
    try {
      await engram.sync.masterKey.restore(words.join(' '));
      const engine = await engram.sync.getEngine();
      if (!engine) throw new Error('Choose the storage your library lives in first.');
      await engine.updateManifest(); // fails on a key that doesn't fit this store
      void engram.sync.syncNow();
      goHome();
    } catch (e) {
      await engram.sync.masterKey.clear();
      const mismatch = /key mismatch|bad manifest|invalid recovery|invalid tag/i.test((e as Error).message);
      if (mismatch && ++tries.current >= MAX_TRIES) { router.replace('/sync/recovery-failure' as Href); return; }
      setMessage(mismatch ? "These words don't open the library in this storage. Check each word against your note." : (e as Error).message);
    } finally { setBusy(false); }
  }

  if (backend === 'off') {
    return (
      <Screen>
        <Header title="Recovery phrase" />
        <View style={{ padding: space[4], gap: space[4] }}>
          <Text color="text2">First choose the storage your library already lives in.</Text>
          <Button title="Choose storage" onPress={() => router.push('/settings/sync')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Recovery phrase" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4] }} keyboardShouldPersistTaps="handled">
        <Text size="sm" color="text2">Type or paste the 12 words in order.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: c.surface2, borderRadius: 14, padding: space[2] }}>
          {words.map((w, i) => {
            const bad = !!w && !isWord(w);
            return (
              <View key={i} style={{ width: '50%', padding: space[1] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: space[2] }}>
                  <Text mono color="text3" style={{ fontSize: 10, width: 16, textAlign: 'right' }}>{i + 1}</Text>
                  <TextInput
                    ref={(r) => { inputs.current[i] = r; }}
                    accessibilityLabel={`Word ${i + 1}`}
                    value={w}
                    onChangeText={(t) => edit(i, t)}
                    onSubmitEditing={() => inputs.current[i + 1]?.focus()}
                    autoCapitalize="none" autoCorrect={false} spellCheck={false} blurOnSubmit={false}
                    returnKeyType={i === 11 ? 'done' : 'next'}
                    style={{ flex: 1, minHeight: 44, fontFamily: font.mono, fontSize: 14, color: bad ? c.text2 : c.text }}
                  />
                </View>
                {bad ? <Text color="text2" style={{ fontSize: 11, lineHeight: 14, paddingLeft: space[2] }}>Not a recovery word</Text> : null}
              </View>
            );
          })}
        </View>
        {busy ? <ProgressLine /> : null}
        {message ? <Text size="sm" color="text2">{message}</Text> : null}
        <Button title="Open library" disabled={!complete || busy} onPress={() => void restore()} />
        <Button title="Link from another device instead" variant="text" onPress={() => router.replace('/sync/link' as Href)} />
      </ScrollView>
    </Screen>
  );
}

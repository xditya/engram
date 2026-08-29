import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Header } from '../../src/features/sync/Header';
import { hhmm, phraseSaved } from '../../src/features/sync/lib';
import { useEngram, useToast } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Button, ProgressLine, Screen, Sheet, Text } from '../../src/ui';

export default function Phrase() {
  const { c, space } = useTheme();
  const { fontScale } = useWindowDimensions();
  const router = useRouter();
  const { engram } = useEngram();
  const show = useToast((s) => s.show);
  const [words, setWords] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<{ at: number } | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!engram) return;
    void engram.sync.masterKey.phrase().then((p) => setWords(p ? p.split(' ') : []));
    void phraseSaved.get(engram).then((v) => {
      if (!v) return;
      setSaved({ at: Number(v.split('|')[1]) });
    });
  }, [engram]);

  async function copy() {
    if (!words) return;
    await Clipboard.setStringAsync(words.join(' '));
    show('Copied. Paste it somewhere that outlives this phone.');
  }

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // Leaving without the words is the one mistake nothing can undo later, so it costs a tap to confirm.
  const proceed = () => {
    if (saved) { leave(); return; }
    Alert.alert('You have not saved these words yet', 'Without them, a lost phone is a lost library. Not even engram can open it.', [
      { text: 'Copy them', onPress: () => void copy() },
      { text: 'I saved them', onPress: () => setConfirm(true) },
      { text: 'Leave anyway', style: 'destructive', onPress: leave },
    ]);
  };

  if (!words) return <Screen><Header /><ProgressLine /></Screen>;
  if (!words.length) return <Screen><Header /><Text color="text2" style={{ padding: space[4] }}>No recovery phrase on this device yet. Turn on sync first.</Text></Screen>;

  const perRow = fontScale >= 2 ? 2 : 4;

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: space[6] }}>
        <Text weight={600} style={{ fontSize: 26, lineHeight: 32, marginTop: 18 }}>Your recovery phrase</Text>
        <Text color="text2" size="sm" style={{ lineHeight: 22, marginTop: 10, marginBottom: 22 }}>This is the only way into your library on a new device if this one is lost.</Text>

        <View
          accessible
          accessibilityLabel={words.map((w, i) => `${i + 1} ${w}`).join(', ')}
          style={{ backgroundColor: c.surface2, borderRadius: 14, paddingVertical: 22, paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, columnGap: 0 }}
        >
          {words.map((w, i) => (
            <View key={i} style={{ width: `${100 / perRow}%`, paddingHorizontal: 5 }}>
              <Text mono color="text3" style={{ fontSize: 10, lineHeight: 14 }}>{i + 1}</Text>
              <Text mono selectable style={{ fontSize: 14 }}>{w}</Text>
            </View>
          ))}
        </View>
        <Text color="text2" size="xs" style={{ lineHeight: 19, marginTop: 14 }}>Anyone with these words can read your library. engram never sees them.</Text>

        <View style={{ gap: space[3], marginTop: 22 }}>
          <Button title="Copy" height={52} onPress={() => void copy()} />
          {saved ? (
            <Text size="sm" color="text2" style={{ textAlign: 'center', paddingVertical: space[3] }}>
              Saved · <Text size="sm" mono color="text3">{hhmm(saved.at)}</Text>
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
              <Text size="sm" weight={500} color="accent">I saved them</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={proceed} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
            <Text size="sm" color="text2">{saved ? 'Done' : 'Skip for now'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Confirm open={confirm} words={words} onClose={() => setConfirm(false)} onDone={async () => {
        if (engram) await phraseSaved.set(engram, 'written');
        setSaved({ at: Date.now() });
        setConfirm(false);
        leave();
      }} />
    </Screen>
  );
}

// Two words by number prove the copy exists, wherever it was put. No lockout, no counter.
function Confirm({ open, words, onClose, onDone }: { open: boolean; words: string[]; onClose: () => void; onDone: () => void }) {
  const { c, space, font } = useTheme();
  const picks = useMemo(() => {
    const a = Math.floor(Math.random() * 12);
    let b = Math.floor(Math.random() * 11); if (b >= a) b++;
    return [a, b].sort((x, y) => x - y);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [typed, setTyped] = useState(['', '']);
  const [wrong, setWrong] = useState<number | null>(null);

  const check = () => {
    const bad = picks.findIndex((p, i) => typed[i]!.trim().toLowerCase() !== words[p]);
    if (bad === -1) { setTyped(['', '']); onDone(); } else setWrong(picks[bad]!);
  };
  const input = { backgroundColor: c.surface2, borderRadius: 8, minHeight: 44, paddingHorizontal: space[3], color: c.text, fontFamily: font.mono, fontSize: 15 } as const;

  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ gap: space[3], paddingTop: space[2] }}>
        <Text weight={500}>Check what you saved</Text>
        {picks.map((p, i) => (
          <View key={p} style={{ gap: space[1] }}>
            <Text size="xs" color="text2">Word <Text size="xs" mono color="text2">{p + 1}</Text></Text>
            <TextInput
              accessibilityLabel={`Word ${p + 1}`}
              style={input}
              autoCapitalize="none" autoCorrect={false} spellCheck={false}
              value={typed[i]}
              onChangeText={(t) => { setWrong(null); setTyped(typed.map((x, j) => (j === i ? t : x))); }}
            />
          </View>
        ))}
        {wrong !== null ? <Text size="sm" color="text2">That's not word <Text size="sm" mono color="text2">{wrong + 1}</Text>. Check what you saved.</Text> : null}
        <Button title="Done" disabled={typed.some((t) => !t.trim())} onPress={check} />
      </View>
    </Sheet>
  );
}

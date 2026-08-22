import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Keychain from 'react-native-keychain';
import { Header } from '../../src/features/sync/Header';
import { KEYCHAIN, hhmm, passwordManagerName, phraseSaved } from '../../src/features/sync/lib';
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
  const [saved, setSaved] = useState<{ where: string; at: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!engram) return;
    void engram.sync.masterKey.phrase().then((p) => setWords(p ? p.split(' ') : []));
    void phraseSaved.get(engram).then((v) => {
      if (!v) return;
      const [how, at] = v.split('|');
      setSaved({ where: how === 'written' ? 'your note' : passwordManagerName(), at: Number(at) });
    });
  }, [engram]);

  async function save() {
    if (!engram || !words) return;
    try {
      const r = await Keychain.setGenericPassword(KEYCHAIN.user, words.join(' '), { service: KEYCHAIN.service, cloudSync: true });
      if (!r) throw new Error('no store');
      await phraseSaved.set(engram, 'keychain');
      setSaved({ where: passwordManagerName(), at: Date.now() });
    } catch {
      setSaveError(`Couldn't save to ${passwordManagerName()} on this phone. Copy the words or write them down instead.`);
    }
  }
  async function copy() {
    if (!words) return;
    await Clipboard.setStringAsync(words.join(' '));
    show('Copied');
  }

  if (!words) return <Screen><Header /><ProgressLine /></Screen>;
  if (!words.length) return <Screen><Header /><Text color="text2" style={{ padding: space[4] }}>No recovery phrase on this device yet. Turn on sync first.</Text></Screen>;

  const perRow = fontScale >= 2 ? 2 : 4;

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[6], gap: space[4] }}>
        <Text weight={600} style={{ fontSize: 26, lineHeight: 32 }}>Your recovery phrase</Text>
        <Text size="sm" color="text2">This is the only way into your library on a new device if this one is lost.</Text>

        <View
          accessible
          accessibilityLabel={words.map((w, i) => `${i + 1} ${w}`).join(', ')}
          style={{ backgroundColor: c.surface2, borderRadius: 14, paddingVertical: space[4], paddingHorizontal: space[3], flexDirection: 'row', flexWrap: 'wrap' }}
        >
          {words.map((w, i) => (
            <View key={i} style={{ width: `${100 / perRow}%`, paddingVertical: space[2], paddingHorizontal: space[1] }}>
              <Text mono color="text3" style={{ fontSize: 10, lineHeight: 14 }}>{i + 1}</Text>
              <Text mono selectable style={{ fontSize: 14 }}>{w}</Text>
            </View>
          ))}
        </View>
        <Text color="text2" style={{ fontSize: 13, lineHeight: 19 }}>Anyone with these words can read your library. engram never sees them.</Text>

        <View style={{ gap: space[3], marginTop: space[2] }}>
          {saved ? (
            <Text size="sm" color="text2" style={{ textAlign: 'center', paddingVertical: space[3] }}>
              Saved to {saved.where} · <Text size="sm" mono color="text3">{hhmm(saved.at)}</Text>
            </Text>
          ) : <Button title="Save to password manager" onPress={() => void save()} />}
          {saveError ? <Text size="sm" color="text2">{saveError}</Text> : null}
          <Button title="Copy" variant="outline" onPress={() => void copy()} />
          {saved?.where === 'your note' ? null : <Button title="I wrote it down" variant="text" onPress={() => setConfirm(true)} />}
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
            <Text size="sm" color="text2">Skip for now</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Confirm open={confirm} words={words} onClose={() => setConfirm(false)} onDone={async () => {
        if (engram) await phraseSaved.set(engram, 'written');
        setSaved({ where: 'your note', at: Date.now() });
        setConfirm(false);
        (router.canGoBack() ? router.back() : router.replace('/'));
      }} />
    </Screen>
  );
}

// Two words by number prove the note exists. No lockout, no counter.
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
        <Text weight={500}>Check your note</Text>
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
        {wrong !== null ? <Text size="sm" color="text2">That's not word <Text size="sm" mono color="text2">{wrong + 1}</Text>. Check your note.</Text> : null}
        <Button title="Done" disabled={typed.some((t) => !t.trim())} onPress={check} />
      </View>
    </Sheet>
  );
}

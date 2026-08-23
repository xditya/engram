import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Step } from '../../src/features/onboarding/Step';
import { Field } from '../../src/features/onboarding/Field';
import { useShareTip } from '../../src/features/onboarding/shareTip';
import { useEngram } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Chip, Text } from '../../src/ui';

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export default function FirstSave() {
  const { space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const [text, setText] = useState('');
  const [clip, setClip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = () => router.push('/onboarding/intelligence');

  useEffect(() => {
    Clipboard.getStringAsync().then((s) => { if (isUrl(s)) setClip(s.trim()); }).catch(() => {});
  }, []);

  const save = async () => {
    if (!engram || !text.trim()) return;
    setBusy(true);
    try {
      if (isUrl(text)) await engram.capture.saveUrl(text.trim()); else engram.capture.saveNote(text.trim());
      useShareTip.getState().show();
      next();
    } finally { setBusy(false); }
  };

  return (
    <Step
      n={2}
      footer={<>
        <Button title="Save" height={52} disabled={!text.trim() || busy} onPress={() => void save()} />
        <Button title="Not now" variant="text" onPress={next} />
      </>}
    >
      <Text size="xxl" weight={600}>Save your first thing</Text>
      <Text color="text2">A link, or a note. Anything.</Text>
      {clip && clip !== text ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip label="Paste what's on your clipboard" onPress={() => setText(clip)} />
        </View>
      ) : null}
      <Field
        mono={isUrl(text)}
        value={text}
        onChangeText={setText}
        placeholder="https://… or a note"
        multiline
        style={{ minHeight: 96, textAlignVertical: 'top', marginTop: space[2] }}
      />
    </Step>
  );
}

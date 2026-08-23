import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { IntelligenceSettings } from '@engram/core';
import { Card, Step } from '../../src/features/onboarding/Step';
import { Field } from '../../src/features/onboarding/Field';
import { useEngram, useSettings } from '../../src/lib/engram';
import { onDeviceTier } from '../../src/platform/onDevice';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Chip, Text } from '../../src/ui';

type Mode = IntelligenceSettings['mode'];
type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter';
const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' }, { id: 'openai', label: 'OpenAI' }, { id: 'gemini', label: 'Gemini' }, { id: 'openrouter', label: 'OpenRouter' },
];

// ponytail: compact chooser without live key validation; the Settings chooser owns that. Keys are stored as typed.
export default function Intelligence() {
  const { space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const patch = useSettings((s) => s.patch);
  const [mode, setMode] = useState<Mode | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [key, setKey] = useState('');
  const onDeviceReason = engram?.onDeviceReason;
  const next = () => router.push('/onboarding/sync');

  const apply = async () => {
    if (mode === 'key') {
      await engram?.secrets.set('apiKey', key.trim());
      patch('intelligence', { mode, provider, summaries: false });
    } else if (mode === 'on-device') {
      patch('intelligence', { mode, summaries: false });
    } else {
      patch('intelligence', { mode: 'off' });
    }
    next();
  };

  return (
    <Step
      n={3}
      footer={<>
        <Button title="Continue" height={52} disabled={!mode || (mode === 'key' && !key.trim())} onPress={() => void apply()} />
        <Button title="Skip for now" variant="outline" onPress={() => { patch('intelligence', { mode: 'off' }); next(); }} />
      </>}
    >
      <Text size="xxl" weight={600}>Intelligence</Text>
      <Text color="text2">Tags, summaries and visual search. Run on this device or bring your own key.</Text>
      <Card
        title="On this device"
        badge={onDeviceTier() === 'recommended' && !onDeviceReason ? 'Recommended' : 'Experimental'}
        body={onDeviceReason ? `May be slow on this phone. ${onDeviceReason}` : 'Private and free. Tags and visual search; summaries are off by default. Downloads a model once (~1 GB, Wi-Fi only).'}
        disabled={!!onDeviceReason}
        selected={mode === 'on-device'}
        onPress={() => setMode('on-device')}
      />
      <Card title="Bring a key" body="Typical use costs a few cents a month, billed by the provider, never by engram." selected={mode === 'key'} onPress={() => setMode('key')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] }}>
          {PROVIDERS.map((p) => <Chip key={p.id} label={p.label} active={provider === p.id} onPress={() => setProvider(p.id)} />)}
        </View>
        <Field mono secureTextEntry value={key} onChangeText={setKey} placeholder="API key" accessibilityLabel="API key" />
        <Text size="xs" color="text3">{key.trim() ? 'Checked when first used' : 'Paste a key to continue'}</Text>
      </Card>
      <Card title="Off" body="Search still works on titles, text and tags you add." selected={mode === 'off'} onPress={() => setMode('off')} />
    </Step>
  );
}

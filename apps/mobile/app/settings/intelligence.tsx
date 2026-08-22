import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ai, type IntelligenceSettings } from '@engram/core';
import { createOnDevice, onDeviceTier } from '../../src/platform/onDevice';
import { useEngram, useLiveQuery, useSettings, useToast } from '../../src/lib/engram';
import {
  KEY_PAGES, backfill, checkKey, costLine, hostOf, modelOf, startBackfill, stopBackfill, type Check, type KeyProvider,
} from '../../src/features/settings/intelligence';
import { Field, Group, InlineButton, Page, RadioCard, Segmented, ToggleRow, n } from '../../src/features/settings/ui';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Chip, ProgressLine, Sheet, Text } from '../../src/ui';

type Seg = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';
const SEGMENTS: { id: Seg; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' }, { id: 'openai', label: 'OpenAI' }, { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' }, { id: 'custom', label: 'Custom endpoint' },
];
const PRESETS: { id: KeyProvider; label: string }[] = [
  { id: 'ollama', label: 'Ollama' }, { id: 'lmstudio', label: 'LM Studio' }, { id: 'groq', label: 'Groq' }, { id: 'mistral', label: 'Mistral' },
];
const segOf = (p?: KeyProvider): Seg => (p === 'anthropic' || p === 'openai' || p === 'gemini' || p === 'openrouter' ? p : 'custom');
const MODEL_SIZE = '≈ 600 MB';

export default function Intelligence() {
  const { space } = useTheme();
  const { engram } = useEngram();
  const s = useSettings((x) => x.intelligence);
  const patch = useSettings((x) => x.patch);
  const show = useToast((t) => t.show);
  const set = (p: Partial<IntelligenceSettings>) => patch('intelligence', p);

  // On this device
  const offered = !!engram && !engram.onDeviceReason;
  const [dl, setDl] = useState<{ llm: number; embed: number } | null>(null);
  const [ready, setReady] = useState(false);
  const download = async () => {
    const od = createOnDevice((what, f) => setDl((d) => ({ llm: 0, embed: 0, ...d, [what]: f })));
    if (!od) return;
    setDl({ llm: 0, embed: 0 });
    const ok = await od.ready();
    setDl(null);
    setReady(ok);
    if (ok) set({ mode: 'on-device', summaries: false });
    else show("Couldn't download the model. Try again on Wi-Fi.");
  };
  // Loading the app-wide instance is what lets skipped jobs run again (the download above was a separate instance).
  useEffect(() => {
    if (s.mode !== 'on-device' || !offered) return;
    void engram!.platform.onDevice!.ready().then((ok) => { setReady(ok); if (ok) { engram!.queue.reenqueueSkipped(); void engram!.drain(); } });
  }, [engram, offered, s.mode]);

  // Bring a key
  const seg = segOf(s.provider);
  const [key, setKey] = useState('');
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [help, setHelp] = useState(false);
  const [adv, setAdv] = useState(false);
  const [models, setModels] = useState<{ chat: string; embed: string; base: string }>({ chat: s.chatModel ?? '', embed: s.embedModel ?? '', base: s.baseUrl ?? '' });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gen = useRef(0); // a check that finished after the provider or key changed must not land
  useEffect(() => { if (engram) setKey(engram.secrets.get('apiKey') ?? ''); }, [engram]);

  const needsKey = seg !== 'custom' || (s.provider ? s.provider in ai.PRESETS && ai.PRESETS[s.provider as keyof typeof ai.PRESETS].needsKey : false);
  const runCheck = (k: string, settings: IntelligenceSettings) => {
    clearTimeout(timer.current);
    const g = ++gen.current;
    if (!k && needsKey) { setCheck({ state: 'idle' }); void engram?.secrets.set('apiKey', null); return; }
    setCheck({ state: 'checking' });
    timer.current = setTimeout(async () => {
      const r = await checkKey(settings, k.trim());
      if (g !== gen.current) return;
      setCheck(r);
      if (r.state === 'ok' && engram) { await engram.secrets.set('apiKey', k.trim() || null); engram.queue.reenqueueSkipped(); void engram.drain(); }
    }, 600);
  };
  const onKey = (k: string) => { setKey(k); runCheck(k, s); };
  const choose = (p: KeyProvider, extra: Partial<IntelligenceSettings> = {}) => {
    const next: Partial<IntelligenceSettings> = { mode: 'key', provider: p, baseUrl: undefined, chatModel: undefined, embedModel: undefined, ...extra };
    // A key belongs to one provider: drop it on a switch so jobs skip (and revive on a good check) rather than fail 401s.
    const k = p === s.provider ? key : '';
    if (p !== s.provider) { setKey(''); void engram?.secrets.set('apiKey', null); }
    set(next);
    setModels({ chat: next.chatModel ?? '', embed: next.embedModel ?? '', base: next.baseUrl ?? '' });
    runCheck(k, { ...s, ...next });
  };
  const paste = async () => { const t = (await Clipboard.getStringAsync()).trim(); if (t) onKey(t); };
  const commitAdvanced = () => {
    const next = { chatModel: models.chat.trim() || undefined, embedModel: models.embed.trim() || undefined, baseUrl: models.base.trim() || undefined };
    set(next);
    runCheck(key, { ...s, ...next });
  };

  const checkLine = check.state === 'idle' ? (needsKey ? 'Paste a key to check it' : 'Enter a base URL to check it')
    : check.state === 'checking' ? 'Checking…'
    : check.state === 'ok' ? `Works · ${check.model}${check.host ? ` at ${check.host}` : ''}`
    : check.state === 'rejected' ? 'Key rejected — check for spaces or a missing character'
    : `Can't reach ${check.host}. Check your connection.`;
  const checkColor = check.state === 'rejected' || check.state === 'unreachable' ? 'danger' : check.state === 'ok' ? 'text' : 'text2';

  // Process existing saves
  const bf = useLiveQuery((e) => backfill(e), [s.mode, s.provider, s.chatModel]);
  const running = (bf?.queued ?? 0) > 0;

  const helpFor = KEY_PAGES[seg === 'custom' ? (s.provider ?? '') : seg];

  return (
    <Page title="Intelligence">
      <Text size="sm" color="text2">Tags, summaries and visual search. Run on this device or bring your own key.</Text>

      {offered ? (
        <RadioCard
          title="On this device"
          badge={onDeviceTier() === 'recommended' ? 'Recommended' : 'Experimental'}
          body={`Private and free. Tags and visual search; summaries are off by default. Downloads a model once (${MODEL_SIZE}, Wi-Fi only).${onDeviceTier() === 'experimental' ? ' May be slow on this phone.' : ''}`}
          selected={s.mode === 'on-device'}
          onPress={() => { if (ready) set({ mode: 'on-device' }); else void download(); }}
        >
          {dl ? (
            <View style={{ gap: space[2] }}>
              <ProgressLine />
              <Text size="xs" mono color="text3">{MODEL_SIZE} · {Math.round(((dl.llm + dl.embed) / 2) * 100)}%</Text>
            </View>
          ) : ready ? (
            <>
              <Text size="xs" mono color="text3">Ready</Text>
              <ToggleRow title="Summaries" subtitle="Slower on a phone. Off by default." value={s.summaries} onChange={(v) => set({ summaries: v })} />
            </>
          ) : (
            <Button title="Download" variant="outline" onPress={() => void download()} />
          )}
        </RadioCard>
      ) : engram?.onDeviceReason ? (
        <Text size="xs" color="text3">On this device: {engram.onDeviceReason}</Text>
      ) : null}

      <RadioCard title="Bring a key" body="Use a provider you already pay. Your key stays in this phone's keychain." selected={s.mode === 'key'} onPress={() => { if (s.mode !== 'key') choose(s.provider ?? 'anthropic'); }}>
        <Segmented options={SEGMENTS} value={seg} onChange={(id) => choose(id === 'custom' ? 'custom' : id)} />
        {seg === 'custom' ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {PRESETS.map((p) => <Chip key={p.id} label={p.label} active={s.provider === p.id} onPress={() => choose(p.id, { baseUrl: ai.PRESETS[p.id as keyof typeof ai.PRESETS].baseUrl })} />)}
            </View>
            <Field label="Base URL" placeholder="http://192.168.1.20:11434/v1" keyboardType="url" value={models.base} onChangeText={(t) => setModels({ ...models, base: t })} onBlur={commitAdvanced} />
          </>
        ) : null}
        <Field
          label={needsKey ? 'API key' : 'API key (optional)'}
          secureTextEntry
          value={key}
          onChangeText={onKey}
          placeholder={seg === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          right={<View style={{ flexDirection: 'row' }}>{key ? <InlineButton title="Clear" onPress={() => onKey('')} /> : null}<InlineButton title="Paste" onPress={() => void paste()} /></View>}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <Text size="xs" mono={check.state === 'ok'} color={checkColor} style={{ flex: 1 }}>{checkLine}</Text>
          {helpFor ? <Pressable accessibilityRole="button" onPress={() => setHelp(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text size="xs" color="accent">Where do I get this?</Text></Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: adv }} onPress={() => setAdv(!adv)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text size="sm" color="text2">{adv ? '▾' : '▸'} Advanced</Text>
        </Pressable>
        {adv ? (
          <View style={{ gap: space[3] }}>
            <Field label="Chat model" placeholder={modelOf({ ...s, chatModel: undefined }) || 'default'} value={models.chat} onChangeText={(t) => setModels({ ...models, chat: t })} onBlur={commitAdvanced} />
            <Field label="Embedding model" placeholder={seg === 'anthropic' ? 'none (Anthropic has no embeddings)' : 'default'} value={models.embed} onChangeText={(t) => setModels({ ...models, embed: t })} onBlur={commitAdvanced} />
            {seg !== 'custom' && seg !== 'anthropic' && seg !== 'gemini' ? <Field label="Base URL" placeholder={hostOf({ ...s, baseUrl: undefined })} keyboardType="url" value={models.base} onChangeText={(t) => setModels({ ...models, base: t })} onBlur={commitAdvanced} /> : null}
            {seg === 'anthropic' ? <ToggleRow title="Visual search on this device" subtitle="Anthropic has no embeddings; use the on-device embedder." value={s.embedProvider === 'on-device'} onChange={(v) => set({ embedProvider: v ? 'on-device' : 'same' })} disabled={!offered} /> : null}
          </View>
        ) : null}
        {seg !== 'custom' ? <Text size="xs" color="text3">Typical use costs a few cents a month, billed by the provider, never by engram.</Text> : null}
      </RadioCard>

      <RadioCard title="Off" body="Search still works on titles, text and tags you add." selected={s.mode === 'off'} onPress={() => set({ mode: 'off' })} />

      {s.mode !== 'off' && bf && bf.count > 0 ? (
        <Group>
          <ToggleRow
            title={`Process existing saves (${n(bf.count)})`}
            subtitle={running ? `${n(bf.queued)} left` : costLine(bf.usd, bf.seconds, modelOf(s))}
            value={running}
            onChange={(v) => { if (!engram) return; if (v) startBackfill(engram); else stopBackfill(engram); engram.events.emit(); }}
          />
        </Group>
      ) : null}

      <Sheet open={help} onClose={() => setHelp(false)}>
        <View style={{ gap: space[3], paddingVertical: space[2] }}>
          <Text size="lg" weight={600}>Get a {helpFor?.name ?? 'provider'} key</Text>
          {[
            `Open ${helpFor?.name ?? 'the provider'} and sign in or create an account.`,
            'Create a new API key. Copy it straight away; most providers show it once.',
            'Come back here and tap Paste. The check runs by itself.',
          ].map((step, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space[3] }}>
              <Text size="sm" mono color="text3">{i + 1}</Text>
              <Text size="sm" color="text2" style={{ flex: 1 }}>{step}</Text>
            </View>
          ))}
          <Text size="xs" color="text3">Your key is stored in this phone's keychain and sent only to {hostOf(s)}.</Text>
          {helpFor ? <Button title={`Open ${helpFor.name}`} variant="outline" onPress={() => { void Linking.openURL(helpFor.url); setHelp(false); }} /> : null}
        </View>
      </Sheet>
    </Page>
  );
}

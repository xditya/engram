import { useEffect, useRef, useState } from 'react';
import { Platform as RN, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { Trace } from '../../src/icons/Icon';
import { Header } from '../../src/features/sync/Header';
import { LINK_TTL_MS, claimLinkOffer, newLinkCode, readDevices } from '../../src/features/sync/lib';
import { useEngram, useLiveQuery, useSettings, useSyncStatus } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Button, ProgressLine, Screen, Text } from '../../src/ui';

// ?side=show: this device already has the library and shows a code. Default: this device is new and enters one.
export default function Link() {
  const { side } = useLocalSearchParams<{ side?: string }>();
  return side === 'show' ? <ShowCode /> : <EnterCode />;
}

function ShowCode() {
  const { c, space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<'waiting' | 'expired' | 'linked' | 'error'>('waiting');
  const [error, setError] = useState('');
  const known = useRef<Set<string>>(new Set());

  async function offer() {
    if (!engram) return;
    setState('waiting');
    try {
      const engine = await engram.sync.getEngine();
      const entropy = await engram.sync.masterKey.get();
      if (!engine || !entropy) throw new Error('Turn on sync before linking a device.');
      known.current = new Set(Object.keys((await readDevices(engine)).devices));
      const next = newLinkCode();
      await engine.writeLinkOffer(next, entropy);
      setCode(next);
    } catch (e) { setError((e as Error).message); setState('error'); }
  }
  useEffect(() => { void offer(); }, [engram]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new device announces itself in the manifest once it has the key; poll for it until the code expires.
  useEffect(() => {
    if (!engram || !code || state !== 'waiting') return;
    const started = Date.now();
    const t = setInterval(async () => {
      if (Date.now() - started > LINK_TTL_MS) { setState('expired'); return; }
      const engine = await engram.sync.getEngine();
      if (!engine) return;
      const ids = Object.keys((await readDevices(engine).catch(() => ({ devices: {} }))).devices);
      if (ids.some((id) => !known.current.has(id))) {
        setState('linked');
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => router.back(), 1200);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [engram, code, state, router]);

  return (
    <Screen>
      <Header title="Link a device" />
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: space[5], paddingTop: space[5], gap: space[5] }}>
        {state === 'error' ? <Text color="text2" style={{ textAlign: 'center' }}>{error}</Text> : null}
        {state === 'expired' ? (
          <>
            <Text style={{ textAlign: 'center' }}>That code expired. Show a new one.</Text>
            <Button title="New code" onPress={() => void offer()} />
          </>
        ) : null}
        {state === 'linked' ? (
          <>
            <Trace size={48} color={c.accent} />
            <Text weight={500}>Linked.</Text>
          </>
        ) : null}
        {state === 'waiting' && code ? (
          <>
            <View style={{ padding: space[4], backgroundColor: '#FFFFFF', borderRadius: 14 }}>
              <QRCode value={`engram://link?code=${code}`} size={200} backgroundColor="#FFFFFF" color="#15171A" />
            </View>
            <Text mono accessibilityLabel={`Code ${code.split('').join(' ')}`} style={{ fontSize: 34, lineHeight: 42, letterSpacing: 6 }}>{code}</Text>
            <View style={{ alignSelf: 'stretch', gap: space[3] }}>
              <ProgressLine />
              <Text size="sm" color="text2" style={{ textAlign: 'center' }}>Waiting for your other device…</Text>
            </View>
            <Text size="xs" color="text3" style={{ textAlign: 'center' }}>
              Open engram on your other device → I already use engram → Scan this code, or type the digits.
            </Text>
          </>
        ) : state === 'waiting' ? <ProgressLine /> : null}
      </View>
    </Screen>
  );
}

function EnterCode() {
  const { c, space, font } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const backend = useSettings((s) => s.sync.backend);
  const status = useSyncStatus();
  const [perm, askPerm] = useCameraPermissions();
  const [typing, setTyping] = useState(RN.OS === 'web');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [linkedTo, setLinkedTo] = useState<string | null>(null);
  const cards = useLiveQuery((e) => e.platform.db.query<{ n: number }>('SELECT count(*) AS n FROM items WHERE deleted_at IS NULL')[0]?.n ?? 0, []) ?? 0;
  const scanning = useRef(false);

  async function submit(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(-6);
    if (digits.length !== 6 || busy || !engram) return;
    setBusy(true); setMessage(null);
    try {
      if (!(await claimLinkOffer(engram, digits))) {
        setMessage("That code doesn't match. Check the digits on your other device.");
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const engine = await engram.sync.getEngine();
      const others = Object.entries((engine ? await readDevices(engine) : { devices: {} }).devices)
        .filter(([id]) => id !== engram.deviceId).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
      setLinkedTo(others[0]?.[1].name ?? 'your other device');
      void engram.sync.syncNow();
    } catch (e) {
      setMessage(/expired|not found|404/i.test((e as Error).message) ? 'That code expired. Show a new one on your other device.' : (e as Error).message);
    } finally { setBusy(false); scanning.current = false; }
  }

  if (backend === 'off') {
    return (
      <Screen>
        <Header title="Link this device" />
        <View style={{ padding: space[4], gap: space[4] }}>
          <Text color="text2">First choose the storage your library already lives in.</Text>
          <Button title="Choose storage" onPress={() => router.push('/settings/sync')} />
        </View>
      </Screen>
    );
  }

  if (linkedTo) {
    return (
      <Screen>
        <Header back={false} />
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: space[5], paddingTop: space[6], gap: space[4] }}>
          <Trace size={48} color={c.accent} />
          <Text size="lg" weight={500}>Linked to "{linkedTo}"</Text>
          <View style={{ alignSelf: 'stretch', gap: space[2] }}>
            {status.state === 'syncing' ? <ProgressLine /> : null}
            <Text size="sm" color="text2" style={{ textAlign: 'center' }}>
              {status.state === 'syncing' ? 'Downloading your library… ' : 'Your library: '}<Text size="sm" mono color="text2">{cards.toLocaleString()}</Text> cards
            </Text>
          </View>
          <Button title="Continue" onPress={() => router.replace('/')} style={{ alignSelf: 'stretch' }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Link to your existing library" />
      <View style={{ flex: 1, paddingHorizontal: space[4], gap: space[4] }}>
        {!typing && RN.OS !== 'web' ? (
          perm?.granted ? (
            <View style={{ aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: c.surface2 }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (scanning.current) return;
                  const m = /code=(\d{6})/.exec(data) ?? /^(\d{6})$/.exec(data);
                  if (!m) return;
                  scanning.current = true;
                  void submit(m[1]!);
                }}
              />
            </View>
          ) : (
            <View style={{ aspectRatio: 1, borderRadius: 14, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', padding: space[4], gap: space[3] }}>
              <Text size="sm" color="text2" style={{ textAlign: 'center' }}>Point the camera at the code on your other device.</Text>
              <Button title="Allow camera" variant="outline" onPress={() => void askPerm()} />
            </View>
          )
        ) : (
          <TextInput
            accessibilityLabel="6-digit code"
            value={code}
            onChangeText={(t) => { const d = t.replace(/\D/g, '').slice(0, 6); setCode(d); setMessage(null); if (d.length === 6) void submit(d); }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            placeholder="000000"
            placeholderTextColor={c.text3}
            style={{ fontFamily: font.mono, fontSize: 34, letterSpacing: 8, textAlign: 'center', color: c.text, backgroundColor: c.surface2, borderRadius: 14, paddingVertical: space[4], minHeight: 72 }}
          />
        )}
        {busy ? <ProgressLine /> : null}
        {message ? <Text size="sm" color="text2" style={{ textAlign: 'center' }}>{message}</Text> : null}
        <Text size="xs" color="text3" style={{ textAlign: 'center' }}>Open engram on your other device → Settings → Devices → Link a device</Text>
        {RN.OS !== 'web' ? <Button title={typing ? 'Scan instead' : 'Enter the 6-digit code instead'} variant="text" onPress={() => setTyping(!typing)} /> : null}
        <Button title="Use recovery phrase instead" variant="text" onPress={() => router.replace('/sync/restore' as Href)} />
      </View>
    </Screen>
  );
}

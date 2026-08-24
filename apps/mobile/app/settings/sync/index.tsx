import { useCallback, useState } from 'react';
import { Linking, Platform as RN, ScrollView, Switch, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { storage } from '@engram/core';
import { Icon } from '../../../src/icons/Icon';
import { signInGoogle } from '../../../src/lib/auth';
import { useEngram, useLiveQuery, useSettings, useSyncStatus, useToast } from '../../../src/lib/engram';
import type { SyncBackend } from '../../../src/lib/settings';
import { Header } from '../../../src/features/sync/Header';
import { BACKEND_NAME, hhmm, phraseSaved, retryErrors, unresolvedErrors } from '../../../src/features/sync/lib';
import { Field, RadioCard } from '../../../src/features/settings/ui';
import { useTheme } from '../../../src/theme/useTheme';
import { Button, Hairline, ProgressLine, Row, Screen, Text } from '../../../src/ui';

export default function SyncSettings() {
  const backend = useSettings((s) => s.sync.backend);
  return (
    <Screen>
      <Header title="Sync & Backup" />
      {backend === 'off' ? <Chooser /> : <Status />}
    </Screen>
  );
}

function Chooser() {
  const { space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const patch = useSettings((s) => s.patch);
  const show = useToast((s) => s.show);
  const [busy, setBusy] = useState<SyncBackend | null>(null);
  const [dav, setDav] = useState({ baseUrl: '', username: '', password: '' });
  const [davState, setDavState] = useState<string | null>(null);

  // First time on: mint the key and show the phrase once. A device linked from another already has one, and
  // storage that already holds a library belongs to an existing key, so that device links instead of minting.
  async function turnOn(backend: SyncBackend) {
    if (!engram) return;
    patch('sync', { backend });
    if (await engram.sync.masterKey.get()) { router.back(); return; }
    const existing = await (await engram.sync.getStorage())?.getManifest().catch(() => null);
    if (existing) { router.replace('/sync/link'); return; }
    await engram.sync.masterKey.ensure();
    router.replace('/sync/phrase');
  }
  async function google() {
    if (!engram) return;
    setBusy('gdrive');
    try { await signInGoogle(engram.platform.keys); await turnOn('gdrive'); }
    catch (e) { show((e as Error).message); }
    finally { setBusy(null); }
  }
  async function testDav() {
    if (!engram) return;
    setDavState('Checking…');
    try {
      await storage.createWebDavAdapter(dav).getManifest();
      setDavState('Connected');
      await engram.secrets.set('webdavPassword', dav.password);
      patch('sync', { webdav: { baseUrl: dav.baseUrl, username: dav.username } });
      await turnOn('webdav');
    } catch (e) {
      setDavState(/401|403|refused|unauthori/i.test(String((e as Error).message)) ? 'Server refused the login' : "Couldn't reach server");
    }
  }
  const [pick, setPick] = useState<SyncBackend>('off');
  const ios = RN.OS === 'ios';

  return (
    <ScrollView contentContainerStyle={{ padding: space[3], gap: space[3] }} keyboardShouldPersistTaps="handled">
      <Text size="sm" color="text2" style={{ marginBottom: space[2], marginHorizontal: space[1] }}>
        Keep your library on your other devices through storage you already own. Always encrypted before it leaves this device.
      </Text>
      <RadioCard title="Google Drive" body="Uses a hidden app folder in your Drive. Google only ever stores encrypted files." selected={pick === 'gdrive'} onPress={() => setPick('gdrive')}>
        {busy === 'gdrive' ? <ProgressLine /> : <Button title="Sign in with Google" onPress={google} />}
      </RadioCard>
      <View style={{ opacity: ios ? 1 : 0.4 }} pointerEvents={ios ? 'auto' : 'none'}>
        <RadioCard title="iCloud Drive" body={ios ? 'Uses your iCloud storage. Apple only ever stores encrypted files.' : 'Available on iPhone, iPad and Mac'} selected={pick === 'icloud'} onPress={() => setPick('icloud')}>
          <Button title="Turn on" variant="outline" onPress={() => turnOn('icloud').catch((e) => show((e as Error).message))} />
          <Text size="xs" color="text3">iCloud can take a few minutes to deliver changes between devices.</Text>
        </RadioCard>
      </View>
      <RadioCard title="Advanced (WebDAV)" body="Any WebDAV server: Nextcloud, a NAS, your own host." selected={pick === 'webdav'} onPress={() => setPick('webdav')}>
        <Field label="Server URL" placeholder="https://cloud.example.com/remote.php/dav/files/you/" keyboardType="url" value={dav.baseUrl} onChangeText={(baseUrl) => setDav({ ...dav, baseUrl })} />
        <Field label="Username" value={dav.username} onChangeText={(username) => setDav({ ...dav, username })} />
        <Field label="Password" secureTextEntry value={dav.password} onChangeText={(password) => setDav({ ...dav, password })} />
        {davState === 'Checking…' ? <ProgressLine /> : null}
        {davState && davState !== 'Checking…' ? <Text size="sm" color={davState === 'Connected' ? 'accent' : 'danger'}>{davState}</Text> : null}
        <Button title="Connect" variant="outline" disabled={!dav.baseUrl || davState === 'Checking…'} onPress={() => void testDav()} />
      </RadioCard>
      <RadioCard title="Off" body="Use Export for manual backups." selected={pick === 'off'} onPress={() => setPick('off')} />
    </ScrollView>
  );
}

const ICON = { off: 'sync-up-to-date', upToDate: 'sync-up-to-date', syncing: 'sync-syncing', unreachable: 'sync-unreachable', full: 'sync-full', locked: 'sync-unreachable' } as const;

function Status() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const sync = useSettings((s) => s.sync);
  const patch = useSettings((s) => s.patch);
  const status = useSyncStatus();
  const show = useToast((s) => s.show);
  const errors = useLiveQuery(unresolvedErrors, []) ?? 0;
  const [originals, setOriginals] = useState(false);
  const [phraseOk, setPhraseOk] = useState(true);
  useFocusEffect(useCallback(() => {
    if (!engram) return;
    void phraseSaved.get(engram).then((v) => setPhraseOk(!!v));
    void engram.platform.keys.get('originalsOffline').then((v) => setOriginals(v === '1'));
  }, [engram]));

  const name = BACKEND_NAME[sync.backend];
  const line =
    status.state === 'syncing' ? 'Syncing…'
    : status.state === 'unreachable' ? `Can't reach ${name}`
    : status.state === 'locked' ? "This device can't open the library"
    : status.state === 'full' ? `${name === 'server' ? 'Server' : name} is full`
    : status.at ? 'Up to date · ' : 'Up to date';

  const stop = () => patch('sync', { backend: 'off' });
  const fix =
    status.state === 'unreachable'
      ? sync.backend === 'gdrive' ? { title: 'Sign in again', run: async () => { if (engram) { try { await signInGoogle(engram.platform.keys); } catch (e) { return show((e as Error).message); } void engram.sync.syncNow(); } } }
      : sync.backend === 'icloud' ? { title: 'Open iCloud settings', run: () => Linking.openSettings() }
      : { title: 'Check server', run: stop }
    : status.state === 'full'
      ? sync.backend === 'gdrive' ? { title: 'Manage storage', run: () => Linking.openURL('https://one.google.com/storage') }
      : sync.backend === 'icloud' ? { title: 'Manage storage', run: () => Linking.openSettings() }
      : { title: 'Check server', run: stop }
    : status.state === 'locked'
      ? { title: 'Link from another device', run: async () => { if (engram) { await engram.sync.masterKey.clear(); router.replace('/sync/link'); } } }
    : null;
  const trouble = status.state === 'unreachable' || status.state === 'full' || status.state === 'locked';

  return (
    <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3] }}>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
          <Icon name={ICON[status.state]} color={trouble ? c.danger : c.text2} />
          <View style={{ flex: 1 }}>
            <Text>
              {line}
              {status.state === 'upToDate' && status.at ? <Text mono color="text3">{hhmm(status.at)}</Text> : null}
            </Text>
            <Text size="xs" mono color="text3">{name === 'server' ? sync.webdav?.baseUrl ?? 'WebDAV' : name}</Text>
          </View>
        </View>
        {status.state === 'syncing' ? <ProgressLine /> : null}
        {fix ? <View style={{ padding: space[4], paddingTop: 0 }}><Button title={fix.title} variant="outline" onPress={() => void fix.run()} /></View> : null}
        {errors > 0 ? (
          <>
            <Hairline />
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: space[4], paddingVertical: space[2], gap: space[3] }}>
              <Text size="sm" color="text2" style={{ flex: 1 }}>
                <Text size="sm" mono color="text2">{errors}</Text> item{errors === 1 ? '' : 's'} couldn't be read on this device.
              </Text>
              <Button title="Retry" variant="text" onPress={() => { if (engram) void retryErrors(engram); }} />
            </View>
          </>
        ) : null}
      </View>

      <Button title="Sync now" disabled={status.state === 'syncing'} onPress={() => void engram?.sync.syncNow().then((ok) => show(ok ? 'Synced' : "Couldn't sync"))} />

      <View style={{ backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Text size="sm">Keep originals offline</Text>
            <Text size="xs" color="text2">Download full-size files from other devices over any connection.</Text>
          </View>
          <Switch
            accessibilityLabel="Keep originals offline"
            value={originals}
            trackColor={{ true: c.accent, false: c.line }}
            onValueChange={(v) => { setOriginals(v); void engram?.platform.keys.set('originalsOffline', v ? '1' : '0'); }}
          />
        </View>
        <Hairline />
        <Row title="Devices" onPress={() => router.push('/settings/sync/devices')} />
        <Hairline />
        <Row title={phraseOk ? 'Show recovery phrase' : 'Recovery phrase not saved'} onPress={() => router.push('/sync/phrase')} />
        <Hairline />
        <Row title="Stop syncing on this device" subtitle="Your library stays here. Encrypted files stay in your storage." onPress={() => { stop(); router.back(); }} />
      </View>
      <Text size="xs" color="text3">Encrypted on this device before upload. {name === 'server' ? 'The server' : name} only ever stores scrambled files.</Text>
    </ScrollView>
  );
}

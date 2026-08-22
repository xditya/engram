import { useState } from 'react';
import { Platform as RN } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Step, useFinish } from '../../src/features/onboarding/Step';
import { Field } from '../../src/features/onboarding/Field';
import { signInGoogle } from '../../src/lib/auth';
import { useEngram, useSettings, type Settings } from '../../src/lib/engram';
import { Button, Text } from '../../src/ui';

type Backend = Settings['sync']['backend'];

export default function Sync() {
  const router = useRouter();
  const { engram } = useEngram();
  const patch = useSettings((s) => s.patch);
  const update = useSettings((s) => s.update);
  const finish = useFinish();
  const [backend, setBackend] = useState<Backend | null>(null);
  const [dav, setDav] = useState({ baseUrl: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ios = RN.OS === 'ios';
  const davReady = !!dav.baseUrl.trim() && !!dav.username.trim() && !!dav.password;

  const apply = async () => {
    if (!engram || !backend) return;
    if (backend === 'off') return finish();
    setBusy(true);
    setError(null);
    try {
      if (backend === 'gdrive') await signInGoogle(engram.platform.keys);
      if (backend === 'webdav') await engram.secrets.set('webdavPassword', dav.password);
      await engram.sync.masterKey.ensure();
      patch('sync', backend === 'webdav' ? { backend, webdav: { baseUrl: dav.baseUrl.trim(), username: dav.username.trim() } } : { backend });
      // The phrase screen is the last step; onboarding is over once it is reached.
      update({ onboarded: true });
      router.replace('/sync/phrase');
    } catch (e) {
      setError(backend === 'gdrive' ? 'Google sign-in did not complete.' : (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Step
      n={4}
      footer={<>
        <Button title="Continue" height={52} disabled={!backend || busy || (backend === 'webdav' && !davReady)} onPress={() => void apply()} />
        <Button title="Skip for now" variant="outline" onPress={finish} />
      </>}
    >
      <Text size="xxl" weight={600}>Sync</Text>
      <Text color="text2">Keep your library on your other devices through storage you already own. Always encrypted before it leaves this device.</Text>
      <Card title="Google Drive" body="Uses a hidden app folder in your Drive. Google only ever stores encrypted files." selected={backend === 'gdrive'} onPress={() => setBackend('gdrive')} />
      <Card
        title="iCloud Drive"
        body={ios ? 'Uses your iCloud storage. Apple only ever stores encrypted files.' : 'Available on iPhone, iPad and Mac'}
        disabled={!ios}
        selected={backend === 'icloud'}
        onPress={() => setBackend('icloud')}
      />
      <Card title="Advanced (WebDAV)" body="Any WebDAV server: Nextcloud, a NAS, your own host." selected={backend === 'webdav'} onPress={() => setBackend('webdav')}>
        <Field mono value={dav.baseUrl} onChangeText={(baseUrl) => setDav({ ...dav, baseUrl })} placeholder="Server URL" keyboardType="url" accessibilityLabel="Server URL" />
        <Field value={dav.username} onChangeText={(username) => setDav({ ...dav, username })} placeholder="Username" accessibilityLabel="Username" />
        <Field secureTextEntry value={dav.password} onChangeText={(password) => setDav({ ...dav, password })} placeholder="Password" accessibilityLabel="Password" />
      </Card>
      <Card title="Off" body="Use Export for manual backups." selected={backend === 'off'} onPress={() => setBackend('off')} />
      {error ? <Text size="sm" color="danger">{error}</Text> : null}
    </Step>
  );
}

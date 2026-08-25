import { useCallback, useEffect, useState } from 'react';
import { textDefaults } from '../../../src/ui/Text';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { sync as coreSync } from '@engram/core';
import { Icon } from '../../../src/icons/Icon';
import { Header } from '../../../src/features/sync/Header';
import { deviceIcon, readDevices, relative, removeDevice } from '../../../src/features/sync/lib';
import { useEngram, useSettings, useToast } from '../../../src/lib/engram';
import { useTheme } from '../../../src/theme/useTheme';
import { Button, Hairline, ProgressLine, Screen, Sheet, Text } from '../../../src/ui';

type Device = { id: string; name: string; lastSeen: number };

export default function Devices() {
  const { c, space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const deviceName = useSettings((s) => s.sync.deviceName);
  const patch = useSettings((s) => s.patch);
  const show = useToast((s) => s.show);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Device | null>(null);
  const [mode, setMode] = useState<'menu' | 'rename' | 'remove'>('menu');
  const [name, setName] = useState('');
  const me = engram?.deviceId;

  const load = useCallback(async () => {
    if (!engram) return;
    try {
      const engine = await engram.sync.getEngine();
      const m = engine ? await readDevices(engine) : { devices: {} };
      const list = Object.entries(m.devices).map(([id, d]) => ({ id, name: d.name, lastSeen: d.lastSeen }));
      if (!list.some((d) => d.id === me)) list.push({ id: me!, name: deviceName, lastSeen: 0 });
      setDevices(list.sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : b.lastSeen - a.lastSeen)));
    } catch (e) { setError((e as Error).message); setDevices([{ id: me!, name: deviceName, lastSeen: 0 }]); }
  }, [engram, me, deviceName]);
  useEffect(() => { void load(); }, [load]);

  const open = (d: Device) => { setPicked(d); setName(d.name); setMode('menu'); };
  const close = () => setPicked(null);
  const rename = () => { patch('sync', { deviceName: name.trim() || deviceName }); close(); void load(); };
  async function remove() {
    if (!engram || !picked) return;
    try {
      const engine = await engram.sync.getEngine();
      if (!engine) throw new Error('Sync is off on this device.');
      await removeDevice(engine, picked.id);
      close(); void load();
    } catch (e) { show((e as Error).message, 3500); }
  }

  const now = Date.now();
  return (
    <Screen>
      <Header title="Devices" />
      {!devices ? <ProgressLine /> : null}
      <FlashList
        data={devices ?? []}
        keyExtractor={(d) => d.id}
        ItemSeparatorComponent={Hairline}
        contentContainerStyle={{ paddingHorizontal: space[4] }}
        renderItem={({ item: d }) => {
          const stale = d.lastSeen > 0 && coreSync.isStale(d.lastSeen, now);
          return (
            <Pressable accessibilityRole="button" onPress={() => open(d)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[3] }}>
              <Icon name={deviceIcon(d.name)} color={stale ? c.text3 : c.text2} />
              <View style={{ flex: 1 }}>
                <Text>{d.id === me ? deviceName : d.name}{d.id === me ? <Text color="text3"> · This device</Text> : null}</Text>
                <Text size="xs" mono color="text2">
                  {d.lastSeen ? `last seen ${relative(d.lastSeen, now)}` : 'never synced'}{stale ? ' · re-downloads on return' : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: space[3], paddingVertical: space[5] }}>
            {error ? <Text size="sm" color="text2">Couldn't read the device list: {error}</Text> : null}
            <Button title="Link a device" onPress={() => router.push('/sync/link?side=show' as Href)} />
            <Text size="xs" color="text3">Devices that haven't synced for 6 months re-download the library when they return.</Text>
          </View>
        }
      />

      <Sheet open={!!picked} onClose={close}>
        <View style={{ gap: space[3], paddingTop: space[2] }}>
          {mode === 'menu' ? (
            <>
              <Text weight={500}>{picked?.id === me ? deviceName : picked?.name}</Text>
              {picked?.id === me ? <Button title="Rename" variant="outline" onPress={() => setMode('rename')} /> : null}
              {picked?.id !== me ? <Button title="Remove" variant="outline" danger onPress={() => setMode('remove')} /> : null}
              <Button title="Cancel" variant="text" onPress={close} />
            </>
          ) : mode === 'rename' ? (
            <>
              <Text weight={500}>Rename this device</Text>
              <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
                accessibilityLabel="Device name"
                value={name} onChangeText={setName} autoFocus
                style={{ backgroundColor: c.surface2, borderRadius: 8, minHeight: 44, paddingHorizontal: space[3], color: c.text, fontSize: 15 }}
              />
              <Button title="Save" onPress={rename} />
              <Button title="Cancel" variant="text" onPress={close} />
            </>
          ) : (
            <>
              <Text weight={500}>Remove "{picked?.name}"?</Text>
              <Text size="sm" color="text2">
                It will stop receiving changes and won't be able to open the library after its next restart. Cards it saved stay in your library.
              </Text>
              <Text size="sm" color="text2">This revokes that device's access to the store, not your recovery phrase. Anyone with the phrase can still open the library.</Text>
              <Button title="Remove" variant="outline" danger onPress={() => void remove()} />
              <Button title="Cancel" variant="text" onPress={close} />
            </>
          )}
        </View>
      </Sheet>
    </Screen>
  );
}

import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DEFAULTS } from '../../src/lib/settings';
import { useEngram, useSettings, useToast } from '../../src/lib/engram';
import { backfill, costLine, modelOf, startBackfill } from '../../src/features/settings/intelligence';
import { Field, Group, Page, n } from '../../src/features/settings/ui';
import { Row, Text } from '../../src/ui';

export default function Advanced() {
  const router = useRouter();
  const { engram } = useEngram();
  const s = useSettings();
  const show = useToast((t) => t.show);
  const [clientId, setClientId] = useState(s.advanced.googleClientId ?? '');

  const retag = () => {
    if (!engram) return;
    if (s.intelligence.mode === 'off') { show('Turn on Intelligence first'); return; }
    const b = backfill(engram, true);
    if (!b.count) { show('Nothing to tag yet'); return; }
    Alert.alert(`Re-tag ${n(b.count)} saves`, `${costLine(b.usd, b.seconds, modelOf(s.intelligence))}. Tags you added stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Re-tag', onPress: () => { const q = startBackfill(engram, true); show(b.queued ? `Queued ${n(q)} · ${n(b.queued)} already waiting` : `Queued ${n(q)}`); } },
    ]);
  };

  const rebuildThumbs = () => {
    if (!engram) return;
    const sql = engram.platform.db;
    const thumbs = sql.query<{ hash: string; item_id: string }>("SELECT hash, item_id FROM files WHERE role = 'thumb' AND deleted_at IS NULL");
    engram.db.transaction(() => { for (const t of thumbs) engram.db.files.remove(t.hash); });
    const ids = sql.query<{ item_id: string }>("SELECT DISTINCT item_id FROM files WHERE role IN ('original','poster') AND deleted_at IS NULL");
    for (const { item_id } of ids) engram.queue.enqueueFor(item_id, ['thumb']);
    void engram.drain();
    show(`Rebuilding ${n(ids.length)} thumbnails`);
  };

  const reset = () => Alert.alert('Reset engram on this device', 'Removes every card, file, key and setting from this phone. Other devices and your sync storage are not touched.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: async () => {
      if (!engram) return;
      const sql = engram.platform.db;
      for (const t of ['items', 'files', 'tags', 'spaces', 'space_items', 'jobs', 'ops', 'cell_clock', 'cell_history', 'blob_index', 'sync_cursor', 'sync_errors', 'items_fts']) sql.exec(`DELETE FROM ${t}`);
      await engram.secrets.set('apiKey', null);
      await engram.secrets.set('webdavPassword', null);
      await engram.sync.masterKey.clear();
      useSettings.getState().update({ ...DEFAULTS, onboarded: true });
      engram.events.emit();
      show('Reset');
      router.replace('/');
    } },
  ]);

  return (
    <Page title="Advanced">
      <Group label="Google">
        <View style={{ padding: 12 }}><Field label="Own Google OAuth client ID" placeholder="…apps.googleusercontent.com" value={clientId} onChangeText={setClientId} onBlur={() => s.patch('advanced', { googleClientId: clientId.trim() || undefined })} /></View>
      </Group>
      <Group label="Sync">
        <Row title="WebDAV…" subtitle="Nextcloud, a NAS, your own host" onPress={() => router.push('/settings/sync' as never)} />
      </Group>
      <Group label="Library">
        <Row title="Re-tag library" subtitle="Runs Intelligence over every save again" onPress={retag} />
        <Row title="Rebuild thumbnails" onPress={rebuildThumbs} />
      </Group>
      <Group label="Diagnostics">
        <Row title="Share diagnostics" subtitle="What the share sheet hand-off sees on this device" onPress={() => router.push('/settings/share-diagnostics' as never)} />
      </Group>
      <Group label="Danger">
        <Row title="Reset engram on this device" onPress={reset} />
      </Group>
      <Text size="xs" color="text3">Nothing here phones home. Every action runs on this device only.</Text>
    </Page>
  );
}

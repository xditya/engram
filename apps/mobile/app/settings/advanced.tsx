import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { goHome } from '../../src/lib/nav';
import { repairPreviews } from '../../src/lib/previews';
import { DEFAULTS } from '../../src/lib/settings';
import { useEngram, useSettings, useToast } from '../../src/lib/engram';
import { backfill, costLine, modelOf, startBackfill } from '../../src/features/settings/intelligence';
import { BACKEND_NAME } from '../../src/features/sync/lib';
import { sync as coreSync } from '@engram/core';
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
    show(`Rebuilding ${n(ids.length)} ${ids.length === 1 ? 'thumbnail' : 'thumbnails'} from your photos and videos`);
  };

  const wipeLocal = async () => {
    if (!engram) return;
    const sql = engram.platform.db;
    for (const t of ['items', 'files', 'tags', 'spaces', 'space_items', 'jobs', 'ops', 'cell_clock', 'cell_history', 'blob_index', 'sync_cursor', 'sync_errors', 'items_fts']) sql.exec(`DELETE FROM ${t}`);
    await engram.secrets.set('apiKey', null);
    await engram.secrets.set('webdavPassword', null);
    await engram.sync.masterKey.clear();
    useSettings.getState().update({ ...DEFAULTS, onboarded: true });
    engram.events.emit();
  };

  const reset = () => Alert.alert('Reset engram on this device', 'Removes every card, file, key and setting from this phone. Other devices and your sync storage are not touched.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: async () => {
      await wipeLocal();
      show('Reset');
      goHome();
    } },
  ]);

  // Sync bookkeeping describes a store that no longer exists; drop it so turning sync on again starts clean.
  const forgetStore = () => {
    if (!engram) return;
    const sql = engram.platform.db;
    engram.db.transaction(() => {
      sql.exec('DELETE FROM sync_cursor');
      sql.exec('DELETE FROM sync_errors');
      sql.exec("DELETE FROM blob_index WHERE state = 'remote'");
      sql.exec('UPDATE ops SET pushed = 0');
    });
  };

  const backendName = BACKEND_NAME[s.sync.backend];
  const wipeRemote = async () => {
    const st = await engram!.sync.getStorage();
    if (!st) throw new Error(`${backendName} is not connected on this phone`);
    return coreSync.wipeRemote(st);
  };

  const deleteRemote = () => {
    if (!engram || s.sync.backend === 'off') { show('Sync is off on this phone'); return; }
    Alert.alert(
      `Delete your library from ${backendName}`,
      `Every card, file and key engram put in ${backendName} goes, and this phone stops syncing. What is on this phone stays. Files another device saved that this one never downloaded cannot be recovered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void (async () => {
          try {
            show(`Deleting from ${backendName}…`);
            const gone = await wipeRemote();
            s.patch('sync', { backend: 'off' });
            forgetStore();
            engram.sync.reset();
            engram.events.emit();
            show(`Deleted ${n(gone)} ${gone === 1 ? 'file' : 'files'} from ${backendName}`);
          } catch (e) {
            show(`Couldn't finish: ${e instanceof Error ? e.message : String(e)}`);
          }
        })() },
      ],
    );
  };

  const deleteEverything = () => {
    if (!engram) return;
    Alert.alert(
      'Delete everything',
      `Empties ${backendName} and this phone: every card, file, key and setting, in both places. Other devices keep what they have already downloaded until they sync.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void (async () => {
          try {
            show(`Deleting from ${backendName}…`);
            await wipeRemote();
          } catch (e) {
            show(`Couldn't empty ${backendName}: ${e instanceof Error ? e.message : String(e)}. Nothing was deleted here.`);
            return;
          }
          await wipeLocal();
          show('Deleted');
          goHome();
        })() },
      ],
    );
  };

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
        <Row title="Fetch missing previews" subtitle="Imported or restored cards that never got their image" onPress={() => { if (!engram) return; void repairPreviews(engram, { force: true }).then((r) => show(r.extract || r.blobs || r.ocr ? `Fetching ${n(r.extract)} previews · ${n(r.blobs)} images · reading ${n(r.ocr)}` : 'Every card has its preview')); }} />
        <Row title="Reload all previews" subtitle="Fetches every link preview again, even the ones that look fine" onPress={() => { if (!engram) return; void repairPreviews(engram, { force: true, all: true }).then((r) => show(r.extract ? `Reloading ${n(r.extract)} previews` : 'No links to reload')); }} />
        <Row title="Rebuild thumbnails" subtitle="Photos and videos you added. Link previews are fetched above." onPress={rebuildThumbs} />
      </Group>
      <Group label="Diagnostics">
        <Row title="Share diagnostics" subtitle="What the share sheet hand-off sees on this device" onPress={() => router.push('/settings/share-diagnostics' as never)} />
      </Group>
      <Group label="Danger">
        {s.sync.backend === 'off' ? null : <Row title={`Delete the copy in ${backendName}`} subtitle="Empties the sync store and turns sync off here. This phone keeps its library." onPress={deleteRemote} />}
        <Row title="Reset engram on this device" subtitle={s.sync.backend === 'off' ? undefined : `Leaves the copy in ${backendName} alone`} onPress={reset} />
        {s.sync.backend === 'off' ? null : <Row title="Delete everything" subtitle={`This phone and ${backendName}, both`} onPress={deleteEverything} />}
      </Group>
      <Text size="xs" color="text3">Nothing here phones home. Every action runs on this device only.</Text>
    </Page>
  );
}

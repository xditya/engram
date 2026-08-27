import { Platform as RN } from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useEngram, useLiveQuery, useSettings, useSyncStatus } from '../../src/lib/engram';
import { useAppearance } from '../../src/features/settings/appearance';
import { KEY_PAGES } from '../../src/features/settings/intelligence';
import { phraseSaved } from '../../src/features/sync/lib';
import { Group, Page, hhmm, n } from '../../src/features/settings/ui';
import { Row } from '../../src/ui';
import { useToast } from '../../src/lib/toast';
import { currentTag, useUpdates } from '../../src/lib/updates';

const SYNC_NAME = { off: 'This device only', gdrive: 'Google Drive', icloud: 'iCloud', webdav: 'server' };

export default function Settings() {
  const router = useRouter();
  const show = useToast((s) => s.show);
  const upd = useUpdates();
  const checkUpdates = () => {
    if (upd.latest) { upd.setOpen(true); return; }
    void upd.check(true).then((r) => show(r === 'newer' ? `engram ${useUpdates.getState().latest?.tag} is out` : r === 'current' ? "You're on the latest build" : r === 'offline' ? "Couldn't reach GitHub" : 'This build has no release to compare against'));
  };
  const { engram } = useEngram();
  const s = useSettings();
  const sync = useSyncStatus();
  const scheme = useAppearance((a) => a.scheme);
  const trashed = useLiveQuery((e) => e.db.items.list({ view: 'trash', limit: 1000 }).length, []) ?? 0;
  const [phraseUnsaved, setPhraseUnsaved] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!engram) return;
    Promise.all([engram.secrets.master.get(), phraseSaved.get(engram)])
      .then(([key, saved]) => setPhraseUnsaved(!!key && !saved)).catch(() => {});
  }, [engram, s.sync.backend]));

  const keyless = s.intelligence.mode === 'key' && !!KEY_PAGES[s.intelligence.provider ?? ''] && !engram?.secrets.get('apiKey');
  const intel = s.intelligence.mode === 'off' || keyless ? 'Off' : s.intelligence.mode === 'on-device' ? 'On this device'
    : KEY_PAGES[s.intelligence.provider ?? '']?.name ?? s.intelligence.provider ?? 'Key';
  const syncValue = sync.state === 'off' ? SYNC_NAME.off
    : sync.state === 'syncing' ? 'Syncing…'
    : sync.state === 'unreachable' ? `Can't reach ${SYNC_NAME[s.sync.backend]}`
    : sync.state === 'locked' ? "Can't open the library"
    : sync.state === 'full' ? `${SYNC_NAME[s.sync.backend]} is full`
    : sync.at ? `Up to date · ${hhmm(sync.at)}` : 'Up to date';
  const go = (path: string) => () => router.push(path as never);

  return (
    <Page title="Settings">
      <Group>
        <Row title="Library" subtitle="Density, trace indicator, default view" value={s.ui.view === 'grid' ? 'Grid' : 'List'} onPress={go('/settings/library')} />
        <Row title="Intelligence" subtitle={s.intelligence.mode === 'off' ? 'Tags, summaries and visual search. Run on this device or bring your own key.' : undefined} value={intel} onPress={go('/settings/intelligence')} />
        <Row title="Screenshots" subtitle="Offer to save each screenshot you take" value={RN.OS === 'android' ? (s.capture.screenshotWatch ? 'On' : 'Off') : undefined} onPress={go('/settings/screenshots')} />
        <Row title="Sync & Backup" subtitle={s.sync.backend === 'off' ? 'Encrypted before it leaves this device.' : undefined} value={syncValue} onPress={go('/settings/sync')} />
        <Row title="Devices" subtitle={s.sync.backend === 'off' ? 'This device' : undefined} onPress={go('/settings/sync/devices')} />
        <Row title="Import" subtitle="mymind, Raindrop, Pocket, bookmarks, Obsidian" onPress={go('/settings/import')} />
        <Row title="Export" subtitle="Everything, including tags. Works without engram." onPress={go('/settings/export')} />
        <Row title="Let go" subtitle="Recoverable for 30 days" value={trashed ? n(trashed) : undefined} onPress={go('/settings/trash')} />
        <Row title="Appearance" value={scheme === 'system' ? 'System' : scheme === 'dark' ? 'Dark' : 'Light'} onPress={go('/settings/appearance')} />
        <Row title="Advanced" onPress={go('/settings/advanced')} />
        <Row title="Updates" subtitle={upd.latest ? `engram ${upd.latest.tag} is available` : currentTag ? `This build: ${currentTag}` : 'Development build'} value={upd.checking ? 'Checking…' : upd.latest ? "What's new" : 'Check'} onPress={checkUpdates} />
        <Row title="About" onPress={go('/settings/about')} />
      </Group>
      {phraseUnsaved ? (
        <Group><Row title="Recovery phrase not saved" onPress={go('/sync/phrase')} /></Group>
      ) : null}
    </Page>
  );
}

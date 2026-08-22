import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useEngram, useLiveQuery, useSettings, useSyncStatus } from '../../src/lib/engram';
import { useAppearance } from '../../src/features/settings/appearance';
import { KEY_PAGES } from '../../src/features/settings/intelligence';
import { phraseSaved } from '../../src/features/sync/lib';
import { Group, Page, hhmm, n } from '../../src/features/settings/ui';
import { useTheme } from '../../src/theme/useTheme';
import { Row } from '../../src/ui';

const SYNC_NAME = { off: 'This device only', gdrive: 'Google Drive', icloud: 'iCloud', webdav: 'server' };

export default function Settings() {
  const router = useRouter();
  const { c } = useTheme();
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

  const intel = s.intelligence.mode === 'off' ? 'Off' : s.intelligence.mode === 'on-device' ? 'On this device'
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
      <Group label="Library">
        <Row title="Library" subtitle="Density, trace indicator, default view" value={s.ui.view === 'grid' ? 'Grid' : 'List'} onPress={go('/settings/library')} />
      </Group>
      <Group label="Intelligence">
        <Row title="Intelligence" subtitle={s.intelligence.mode === 'off' ? 'Tags, summaries and visual search. Run on this device or bring your own key.' : undefined} value={intel} onPress={go('/settings/intelligence')} />
      </Group>
      <Group label="Sync & Backup">
        <Row title="Sync" subtitle={s.sync.backend === 'off' ? 'Keep your library on your other devices through storage you already own. Always encrypted before it leaves this device.' : undefined} value={syncValue} onPress={go('/settings/sync')} />
        <Row title="Devices" onPress={go('/settings/sync/devices')} />
      </Group>
      <Group label="Import / Export">
        <Row title="Import" subtitle="mymind, Raindrop, Pocket, bookmarks, Obsidian" onPress={go('/settings/import')} />
        <Row title="Export" subtitle="Everything, including tags. Works without engram." onPress={go('/settings/export')} />
      </Group>
      <Group label="Let go">
        <Row title="Let go" subtitle="Kept for 30 days" value={trashed ? n(trashed) : undefined} onPress={go('/settings/trash')} />
      </Group>
      <Group label="Appearance">
        <Row title="Appearance" value={scheme === 'system' ? 'System' : scheme === 'dark' ? 'Dark' : 'Light'} onPress={go('/settings/appearance')} />
      </Group>
      <Group label="Advanced">
        <Row title="Advanced" onPress={go('/settings/advanced')} />
      </Group>
      <Group label="About">
        <Row title="About engram" onPress={go('/settings/about')} />
      </Group>
      {phraseUnsaved ? (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line }}>
          <Row title="Recovery phrase not saved" subtitle="Without it, a lost phone means a lost library." onPress={go('/sync/phrase')} />
        </View>
      ) : null}
    </Page>
  );
}

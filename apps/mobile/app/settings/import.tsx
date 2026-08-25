import { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { goHome } from '../../src/lib/nav';
import { useEngram, useSettings, useToast } from '../../src/lib/engram';
import { estimate, modelOf, KEY_PAGES } from '../../src/features/settings/intelligence';
import { read, run, sourceName, type Picked, type Progress, type Tagging } from '../../src/features/settings/importer';
import { Group, Page, RadioRow, n } from '../../src/features/settings/ui';
import { useTheme } from '../../src/theme/useTheme';
import { Button, ProgressLine, Row, Text } from '../../src/ui';

export default function Import() {
  const { space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const intel = useSettings((s) => s.intelligence);
  const show = useToast((t) => t.show);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [reading, setReading] = useState(false);
  const [tagging, setTagging] = useState<Tagging>('later');
  const [prog, setProg] = useState<Progress | null>(null);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: ['application/zip', 'text/csv', 'text/comma-separated-values', 'application/json', 'text/html', 'text/markdown', 'text/plain', '*/*'] });
    const a = r.assets?.[0];
    if (!a) return;
    setReading(true);
    try { setPicked(await read(a.uri, a.name)); }
    catch (e) { show((e as Error).message); }
    finally { setReading(false); }
  };

  const start = () => {
    if (!engram || !picked) return;
    run(engram, picked, tagging, setProg).catch((e: Error) => show(`Import stopped: ${e.message}`));
  };

  const fileCount = picked ? picked.cards.filter((c) => c.fileRef).length : 0;
  const avgChars = picked?.cards.length ? picked.cards.reduce((a, c) => a + (c.title?.length ?? 0) + (c.body?.length ?? 0), 0) / picked.cards.length : 0;
  const cost = picked && intel.mode !== 'off' ? estimate(picked.cards.length, avgChars) : null;
  const providerName = intel.mode === 'on-device' ? 'this device' : KEY_PAGES[intel.provider ?? '']?.name ?? intel.provider ?? 'your key';

  if (prog) {
    return (
      <Page title="Import">
        <View style={{ gap: space[3] }}>
          {!prog.done ? <ProgressLine /> : null}
          <Text size="sm" mono color="text2">Cards {n(prog.cards)} / {n(picked?.cards.length ?? 0)}{fileCount ? ` · Files ${n(prog.files)} / ${n(fileCount)}` : ''}</Text>
          {prog.dupes ? <Text size="sm" mono color="text3">{n(prog.dupes)} duplicates skipped</Text> : null}
          {prog.done ? (
            <>
              <Text size="md" weight={500}>Imported {n(prog.cards)} cards.</Text>
              {tagging === 'now' ? <Text size="sm" color="text2">Tagging runs in the background.</Text> : null}
              <Button title="Back to library" onPress={() => goHome()} />
            </>
          ) : null}
        </View>
      </Page>
    );
  }

  if (!picked) {
    return (
      <Page title="Import">
        <View style={{ gap: space[2] }}>
          <Text size="xl" weight={600}>Bring your cards, links, notes and files</Text>
          <Text size="sm" color="text2">mymind, Raindrop, Pocket, browser bookmarks, an Obsidian folder or an engram export. The format is recognised automatically.</Text>
        </View>
        {reading ? <ProgressLine /> : null}
        <Button title="Choose a file" onPress={pick} disabled={reading} height={52} />
        <Group><Row title="Export" subtitle="Everything, including tags. Works without engram." onPress={() => router.push('/settings/export' as never)} /></Group>
      </Page>
    );
  }

  return (
    <Page title="Import">
      <View style={{ gap: space[2] }}>
        <Text size="lg" weight={600}>Found {n(picked.cards.length)} cards{fileCount ? ` and ${n(fileCount)} files` : ''} from {sourceName(picked.format)}</Text>
        {picked.format === 'mymind' ? <Text size="sm" color="text2">mymind's export doesn't include its AI tags. engram can tag these for you.</Text> : null}
        {picked.warnings.map((w) => <Text key={w} size="xs" mono color="text3">{w}</Text>)}
      </View>
      <Group label="Tagging">
        <RadioRow title="Tag later" subtitle="Cards are imported now. Tag them any time from Intelligence → Process existing saves." selected={tagging === 'later'} onPress={() => setTagging('later')} />
        {intel.mode === 'on-device' ? (
          <RadioRow title="Tag now on this device" subtitle="Free. Takes a while; runs in the background." selected={tagging === 'now'} onPress={() => setTagging('now')} />
        ) : intel.mode === 'key' && cost ? (
          <RadioRow title={`Tag now with ${providerName}`} subtitle={`≈ ${n(picked.cards.length)} cards · about $${cost.usd.toFixed(2)} with ${modelOf(intel)}`} selected={tagging === 'now'} onPress={() => setTagging('now')} />
        ) : null}
      </Group>
      <Button title={`Import ${n(picked.cards.length)} cards`} onPress={start} height={52} />
      <Button title="Choose a different file" variant="text" onPress={() => setPicked(null)} />
    </Page>
  );
}

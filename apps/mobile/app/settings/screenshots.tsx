import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSettings, useToast } from '../../src/lib/engram';
import * as Watcher from '../../modules/engram-screenshots';
import { Group, Page, ToggleRow } from '../../src/features/settings/ui';
import { Text } from '../../src/ui';

export default function ScreenshotSettings() {
  const on = useSettings((s) => s.capture.screenshotWatch);
  const patch = useSettings((s) => s.patch);
  const [running, setRunning] = useState(Watcher.isRunning());
  const show = useToast((s) => s.show);
  // Reflect whether the job is still scheduled (gone after a force-stop or cleared data).
  useFocusEffect(useCallback(() => {
    const r = Watcher.isRunning();
    setRunning(r);
    if (on && !r) patch('capture', { screenshotWatch: false });
  }, [on, patch]));

  const toggle = async (v: boolean) => {
    try {
      if (v) {
        try { await Watcher.requestPermissions(); }
        catch (e) {
          const why = (e as Error).message;
          const text = why === 'partial' ? 'Allow access to all photos, not selected ones, so new screenshots are visible'
            : why.startsWith('missing:') ? `Still missing: ${why.slice(8)}`
            : 'Allow photos and notifications for engram';
          return show(text, 8000, { label: 'Open settings', onPress: () => void Linking.openSettings() });
        }
      }
      patch('capture', { screenshotWatch: v });
      setTimeout(() => {
        const r = Watcher.isRunning();
        setRunning(r);
        if (v && !r) show("Couldn't start the screenshot watcher");
      }, 300);
    } catch (e) { show(`Couldn't change: ${(e as Error).message}`); }
  };

  return (
    <Page title="Screenshots">
      {Platform.OS === 'android' ? (
        <Group label="Capture">
          <ToggleRow title="Watch for screenshots" subtitle="When you take a screenshot, engram offers to save it. Needs photo access." value={on} onChange={(v) => void toggle(v)} />
        </Group>
      ) : null}
      <Text size="sm" color="text2" style={{ paddingHorizontal: 4 }}>
        {Platform.OS === 'android'
          ? (on ? (running ? 'Watching. A banner appears after each screenshot.' : 'Starting…') : 'Off. Screenshots taken while engram is open still show a prompt.')
          : 'iOS does not let apps notice screenshots in the background. A screenshot taken while engram is open shows a prompt to save it; for anything else, use the share sheet.'}
      </Text>
    </Page>
  );
}

import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSettings } from '../../src/lib/engram';
import * as Watcher from '../../modules/engram-screenshots';
import { Group, Page, ToggleRow } from '../../src/features/settings/ui';
import { Text } from '../../src/ui';

export default function ScreenshotSettings() {
  const on = useSettings((s) => s.capture.screenshotWatch);
  const patch = useSettings((s) => s.patch);
  const [running, setRunning] = useState(Watcher.isRunning());
  // Reflect whether the job is still scheduled (gone after a force-stop or cleared data).
  useFocusEffect(useCallback(() => {
    const r = Watcher.isRunning();
    setRunning(r);
    if (on && !r) patch('capture', { screenshotWatch: false });
  }, [on, patch]));

  const toggle = async (v: boolean) => {
    if (v && !(await Watcher.requestPermissions())) return;
    patch('capture', { screenshotWatch: v });
    setTimeout(() => setRunning(Watcher.isRunning()), 300);
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

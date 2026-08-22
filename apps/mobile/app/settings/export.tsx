import { useState } from 'react';
import { View } from 'react-native';
import { useEngram, useLiveQuery, useToast } from '../../src/lib/engram';
import { human, run, sizeOf, type Progress } from '../../src/features/settings/exporter';
import { Page, n } from '../../src/features/settings/ui';
import { useTheme } from '../../src/theme/useTheme';
import { Button, ProgressLine, Text } from '../../src/ui';

export default function Export() {
  const { space } = useTheme();
  const { engram } = useEngram();
  const show = useToast((t) => t.show);
  const size = useLiveQuery(sizeOf, []);
  const [prog, setProg] = useState<Progress | null>(null);
  const busy = !!prog && !prog.done;

  const start = (kind: 'everything' | 'obsidian') => {
    if (!engram) return;
    run(engram, kind, setProg).catch((e: Error) => { setProg(null); show(`Couldn't export: ${e.message}`); });
  };

  return (
    <Page title="Export">
      <View style={{ gap: space[2] }}>
        <Text size="xl" weight={600}>Take everything with you</Text>
        <Text size="sm" color="text2">Everything, including tags. Works without engram.</Text>
        {size ? <Text size="sm" mono color="text3">≈ {human(size.bytes)} · {n(size.cards)} cards</Text> : null}
      </View>
      <View style={{ gap: space[3] }}>
        <Button title="Export everything" onPress={() => start('everything')} disabled={busy} height={52} />
        <Button title="Export as Obsidian markdown" variant="outline" onPress={() => start('obsidian')} disabled={busy} />
      </View>
      {prog ? (
        <View style={{ gap: space[2] }}>
          {busy ? <ProgressLine /> : null}
          <Text size="sm" mono color="text2">Cards {n(prog.cards)} / {n(prog.cardsTotal)}{prog.filesTotal ? ` · Files ${n(prog.files)} / ${n(prog.filesTotal)}` : ''}</Text>
          {prog.done ? <Text size="sm" color="text2">Ready. Choose where to keep it.</Text> : null}
        </View>
      ) : null}
      <Text size="xs" color="text3">The export is plain, not encrypted. Keep it somewhere only you can reach.</Text>
    </Page>
  );
}

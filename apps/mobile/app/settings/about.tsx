import { Linking, Platform as RN, View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Trace } from '../../src/icons/Icon';
import { Group, Page } from '../../src/features/settings/ui';
import { useTheme } from '../../src/theme/useTheme';
import { Row, Text } from '../../src/ui';

const SITE = 'https://engram.xditya.me';
const PROMISE = [
  ['Your data is always exportable', 'in one tap, into a zip of your original files plus engram.json and cards.csv (including AI tags and summaries) and an Obsidian-style markdown folder. The export format is documented in the repo and frozen by a test.'],
  ['Your sync backend is yours.', 'Sync goes to your Google Drive, your iCloud, or any WebDAV server you choose, as end-to-end encrypted op-logs and blobs. We run no server and hold no keys. Your recovery phrase decrypts everything without engram\'s help; the format is specified in the repo and a standalone decrypt script lives there too.'],
  ['The app keeps working if the project dies.', 'There is no account, no license check, no phone-home. Every device keeps a full local copy. Intelligence runs on your own key (Anthropic, OpenAI, Gemini, OpenRouter, any OpenAI-compatible endpoint such as Ollama, LM Studio, Groq or Mistral) or on-device, so it never stops when we do. Anyone can build the app from source and, with their own OAuth client ID and signing keys, publish it.'],
  ['No telemetry, no ads, no data sale, ever.', 'Crash reports are opt-in and contain no library content.'],
];

export default function About() {
  const { c, space } = useTheme();
  const version = (RN.OS === 'web' ? null : Application.nativeApplicationVersion) ?? Constants.expoConfig?.version ?? '0.0.0';
  const build = RN.OS === 'web' ? null : Application.nativeBuildVersion;
  return (
    <Page title="About">
      <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[4] }}>
        <Trace size={40} color={c.accent} />
        <Text size="xl" weight={600}>engram</Text>
        <Text size="xs" mono color="text3">{build ? `${version} (${build})` : version}</Text>
      </View>
      <View style={{ gap: space[3] }}>
        <Text size="lg" weight={500}>The longevity promise</Text>
        <Text size="sm" color="text2">Ours does not depend on us keeping any promise at all.</Text>
        {PROMISE.map(([head, body], i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space[3] }}>
            <Text size="sm" mono color="text3" style={{ width: 16 }}>{i + 1}</Text>
            <Text size="sm" color="text2" style={{ flex: 1 }}>
              <Text size="sm" weight={500}>{head}</Text> {body}
            </Text>
          </View>
        ))}
      </View>
      <Group label="Links">
        <Row title="Website" value="engram.xditya.me" onPress={() => Linking.openURL(SITE)} />
        <Row title="Source code" value="AGPL-3.0" onPress={() => Linking.openURL(`${SITE}/source`)} />
        <Row title="Export format" onPress={() => Linking.openURL(`${SITE}/export-format`)} />
      </Group>
    </Page>
  );
}

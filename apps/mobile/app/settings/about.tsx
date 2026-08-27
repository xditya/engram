import { Linking, Platform as RN, View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Icon, Trace } from '../../src/icons/Icon';
import { Group, Page } from '../../src/features/settings/ui';
import { currentTag } from '../../src/lib/updates';
import { useTheme } from '../../src/theme/useTheme';
import { Row, Text } from '../../src/ui';

const SITE = 'https://engram.xditya.me';
const open = (url: string) => () => { void Linking.openURL(url); };

// Short on purpose: each promise is one line of what, one line of how. The long form lives on the website.
const PROMISE: [string, string][] = [
  ['Always exportable', 'One tap gives you your original files, JSON, a CSV with every tag and summary, and markdown notes.'],
  ['Your storage, your keys', 'Sync goes to your Drive, iCloud or WebDAV server, encrypted before it leaves the phone. engram runs no server.'],
  ['Works if the project dies', 'No account, no licence check, no phone-home. Every device keeps a full copy; anyone can build it from source.'],
  ['No telemetry, ads or data sale', 'Crash reports are opt-in and never include library content.'],
];

export default function About() {
  const { c, space } = useTheme();
  const version = (RN.OS === 'web' ? null : Application.nativeApplicationVersion) ?? Constants.expoConfig?.version ?? '0.0.0';
  const build = RN.OS === 'web' ? null : Application.nativeBuildVersion;
  return (
    <Page title="About">
      <View style={{ alignItems: 'center', gap: space[2], paddingTop: space[4], paddingBottom: space[2] }}>
        <Trace size={44} color={c.accent} />
        <Text size="xl" weight={600}>engram</Text>
        <Text size="sm" color="text2">Remember everything. Own everything.</Text>
        <Text size="xs" mono color="text3">{build ? `${version} (${build})` : version}{currentTag ? ` · ${currentTag}` : ''}</Text>
      </View>

      <Group label="Made by">
        <Row left={<Icon name="globe" size={20} color={c.text2} />} title="Aditya S" subtitle="xditya.me" onPress={open('https://xditya.me')} />
        <Row left={<Icon name="github" size={20} color={c.text2} />} title="GitHub" subtitle="github.com/xditya" onPress={open('https://github.com/xditya')} />
        <Row left={<Icon name="coffee" size={20} color={c.text2} />} title="Buy me a coffee" subtitle="engram is free and open source. A coffee keeps the lights on." onPress={open('https://buymeacoffee.com/xditya')} />
      </Group>

      <Group label="The longevity promise">
        <View style={{ padding: space[4], gap: space[4] }}>
          {PROMISE.map(([head, body], i) => (
            <View key={head} style={{ flexDirection: 'row', gap: space[3] }}>
              <Text size="xs" mono color="text3" style={{ width: 16, paddingTop: 2 }}>{i + 1}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text size="sm" weight={500}>{head}</Text>
                <Text size="xs" color="text2">{body}</Text>
              </View>
            </View>
          ))}
          <Text size="xs" color="text3">None of this depends on anyone keeping a promise; it is how the app is built.</Text>
        </View>
      </Group>

      <Group label="Project">
        <Row title="Website" value="engram.xditya.me" onPress={open(SITE)} />
        <Row title="Source code" value="github" onPress={open('https://github.com/xditya/engram')} />
        <Row title="Export format" subtitle="What is inside the zip, so you can leave any time" onPress={open(`${SITE}/export-format.html`)} />
        <Row title="Licence" value="AGPL-3.0" onPress={open('https://github.com/xditya/engram/blob/main/LICENSE')} />
      </Group>
    </Page>
  );
}

import { Redirect } from 'expo-router';
import { useSettings } from '../src/lib/engram';
import { LibraryScreen } from '../src/features/library/LibraryScreen';

export default function Index() {
  const onboarded = useSettings((s) => s.onboarded);
  return onboarded ? <LibraryScreen /> : <Redirect href="/onboarding" />;
}

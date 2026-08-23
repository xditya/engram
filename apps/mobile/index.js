import 'expo-router/entry';
import { AppRegistry, Platform } from 'react-native';

// Android's translucent ShareActivity mounts this second root instead of the router.
if (Platform.OS === 'android') AppRegistry.registerComponent('share', () => require('./src/features/share/ShareRoot').ShareRoot);

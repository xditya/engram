import { AppRegistry } from 'react-native';

// Entry of the iOS share extension bundle (expo-share-extension mounts the "shareExtension" root). No router.
AppRegistry.registerComponent('shareExtension', () => require('./src/features/share/ShareExtensionRoot').ShareExtensionRoot);

// Android share target: a translucent ShareActivity in its own task hosts the "share" JS root over the
// sharing app, so a share never brings the whole app forward. It takes the SEND / SEND_MULTIPLE filters
// that expo-share-intent adds to MainActivity.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withAndroidStyles, withDangerousMod } = require('@expo/config-plugins');

const SEND = ['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE'];
const isSend = (f) => (f.action ?? []).some((a) => SEND.includes(a.$['android:name']));

const THEME = 'Theme.Engram.ShareOverlay';
const THEME_ITEMS = {
  'android:windowIsTranslucent': 'true',
  'android:windowBackground': '@android:color/transparent',
  'android:windowNoTitle': 'true',
  'android:windowAnimationStyle': '@android:style/Animation.Translucent',
};

const KOTLIN = `package app.engram

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

// Translucent share target. Lives in its own task (singleInstance) so expo-share-intent sees it as the
// task root and handles the intent in place instead of relaunching it. Back / Done finish it, which
// returns to the app that shared.
class ShareActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    // Opened from a notification action: action buttons ignore autoCancel, so clear it here.
    val id = intent.getIntExtra("notificationId", 0)
    if (id != 0) getSystemService(android.app.NotificationManager::class.java).cancel(id)
  }

  override fun getMainComponentName(): String = "share"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {})

  override fun invokeDefaultOnBackPressed() {
    finish()
    overridePendingTransition(0, 0)
  }
}
`;

module.exports = function withShareOverlay(config) {
  config = withAndroidManifest(config, (c) => {
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    const send = (main['intent-filter'] ?? []).filter(isSend);
    main['intent-filter'] = (main['intent-filter'] ?? []).filter((f) => !isSend(f));
    app.activity = [
      ...(app.activity ?? []).filter((a) => a.$['android:name'] !== '.ShareActivity'),
      {
        $: {
          'android:name': '.ShareActivity',
          'android:theme': `@style/${THEME}`,
          'android:exported': 'true',
          'android:launchMode': 'singleInstance',
          'android:excludeFromRecents': 'true',
          'android:configChanges': main.$['android:configChanges'],
          'android:windowSoftInputMode': 'adjustResize',
          'android:screenOrientation': 'portrait',
        },
        'intent-filter': send,
      },
    ];
    return c;
  });
  config = withAndroidStyles(config, (c) => {
    const styles = c.modResults.resources.style ?? (c.modResults.resources.style = []);
    // Android's default focus highlight paints a grey slab over background-less pressables when the device leaves touch mode.
    const app = styles.find((s) => s.$.name === 'AppTheme');
    if (app) { app.item = (app.item ?? []).filter((it) => it.$.name !== 'android:defaultFocusHighlightEnabled'); app.item.push({ $: { name: 'android:defaultFocusHighlightEnabled' }, _: 'false' }); }
    const i = styles.findIndex((s) => s.$.name === THEME);
    if (i >= 0) styles.splice(i, 1);
    styles.push({ $: { name: THEME, parent: 'AppTheme' }, item: Object.entries(THEME_ITEMS).map(([name, _]) => ({ $: { name }, _ })) });
    return c;
  });
  return withDangerousMod(config, ['android', (c) => {
    const file = path.join(c.modRequest.platformProjectRoot, 'app/src/main/java/app/engram/ShareActivity.kt');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, KOTLIN);
    return c;
  }]);
};

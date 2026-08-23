# Share path

Both platforms show the same Save Moment (`src/features/share/ShareOverlay.tsx`, behaviour in the design's
`SAVE_MOMENT.md`) over the sharing app and save through `engram.capture.fromShareIntent`. Android gets there with
`expo-share-intent` (Android only, `disableIOS`), iOS with `expo-share-extension`. Nothing on this path fetches the
network; `extract` / `thumb` / `classify` / `embed` run from the app's job queue (`engram.drain()`).

Payload → capture mapping (`savePendingCapture`):

| payload | call |
|---|---|
| `files[]` (image / video / pdf / other) | `capture.saveFiles(paths)` — one item per file, original copied to the FileStore |
| `webUrl` (+ `text` ≠ url) | `capture.saveUrl(webUrl, { note: text })` — dedups by normalized url |
| `text` containing a url (Android "Title\nhttps://…") | `capture.saveUrl(url, { note: rest unless it equals meta.title })` |
| other `text` | `capture.saveNote(text)` |

## Android

`plugins/withShareOverlay.js` (listed before `expo-share-intent` in `app.config.ts`, because later plugins'
manifest mods run first) moves the `SEND` / `SEND_MULTIPLE` filters off `MainActivity` onto a generated
`ShareActivity` (`android/app/src/main/java/app/engram/ShareActivity.kt`, written at prebuild):

- theme `Theme.Engram.ShareOverlay` (translucent window, transparent background) so the sharing app stays visible;
- `launchMode="singleInstance"` + `excludeFromRecents`: it is always its task root, so `ExpoShareIntentModule`
  handles the intent in place (it relaunches non-root activities with `NEW_TASK`), and `finish()` returns to
  the sharing app. An `activity-alias` cannot do this: `android:theme` is not an alias attribute;
- `mainComponentName = "share"`: `index.js` registers a second root (`src/features/share/ShareRoot.tsx`)
  with no router and no opaque background, which renders `ShareOverlay` (save, fold into the trace mark,
  Saved pill, live tags, Space toggles, Done / back / 6 s idle -> `resetShareIntent()` then
  `BackHandler.exitApp()` -> `ShareActivity.finish()`). Tapping the mark opens `engram://card/<id>` in the
  main app. `app/_layout.tsx` ignores share intents on Android so the main tree never double-handles one.

After `npx expo prebuild --platform android` confirm the manifest has the filters on `.ShareActivity` only.

Dev builds only: expo-dev-launcher intercepts a cold share (no bundle loaded yet) with its own launcher UI; open
the app from Metro once, then share. Release builds have no launcher.

## iOS

`expo-share-extension` generates the only share target (`PlugIns/engramShareExtension.appex`, bundle id
`app.engram.ShareExtension`, label `Save to engram`, App Group `group.app.engram`; activation rules in `app.config.ts`:
1 url, text, 10 images, 1 movie, 10 files). `plugins/withShareExtension.js` (listed before it, because mods run
last-registered first) patches what it generates; `node plugins/check.js` runs the Swift rewrite against the
package's template. The extension has two modes, decided in Swift before any JavaScript loads:

**App Group available** (properly signed builds): the extension boots its own React root, `index.share.js` →
`src/features/share/ShareExtensionRoot.tsx`, through Expo's `ExpoReactNativeFactory` (the stock template uses
`RCTReactNativeFactory`, which never creates an Expo `AppContext`, so `expo-modules-core` throws at module
evaluation on SDK 57). The root boots `src/lib/engramLite.ts`: op-sqlite on the App Group database, the file store,
`createCapture`, and nothing that ticks (no queue worker, no sync engine, no models). The save writes `items` +
`jobs` + op-log rows exactly as the app would, with the app's device id (mirrored by `createEngram` into
`<container>/device-id`), so the app enriches the card on its next foreground and sync stays consistent. Tags and
Space toggles read and write the same database. *Done* / tap outside / 7 s idle call `close()`; tapping the card
calls `openHostApp('card/<id>')`; the host app is never opened otherwise. `excludedPackages` keeps the expo modules
the overlay does not import (dev client, camera, media library, background tasks, OCR, ...) out of the extension
target; community pods (executorch, op-sqlite, reanimated) are linked by `use_native_modules!` regardless, which
costs binary size, not launch memory. RN `Text` mis-scales with Dynamic Type inside extensions, so the root turns
`allowFontScaling` off through `ui/Text.tsx`'s `textDefaults`.

**No App Group** (free-account sideloads, or a group renamed by AltStore/SideStore and listed under `ALTAppGroups`):
the JS root is never mounted. The rewritten Swift hands the share to the app the way the previous extension did:
url/text ride in the deep link (`engram://dataUrl=share?nonce=…&p=<base64url JSON>`), media is copied to the
temp directory (the template's container lookup is never force-unwrapped and its early returns, which left the
DispatchGroup waiting forever, are gone) and parked on the named pasteboard `app.engram.share`
(`p=pasteboard`), then the app opens. `app/_layout.tsx` reads `p` and `EngramDiag.takeSharedPasteboard()` drains
the pasteboard, unchanged. A renamed group hands off too: the JS hub opens the database through the configured id,
and the app itself (`dataDir()`) only uses that id.

`expo-share-intent`'s iOS native module still compiles into the app (pnpm patch kept); nothing imports it on iOS.
Dev builds: Expo maps the virtual Metro entry to `index.bundle`, which `expo-share-extension/metro` rewrites to `index.share.bundle` for extension requests, so the extension never loads `index.js` or the router.

## Screenshots

Two pieces, neither needs Play Services (F-Droid / GrapheneOS builds work unchanged):

**In-app prompt, both platforms** (`src/lib/screenshots.ts`): `expo-screen-capture`'s `addScreenshotListener`
fires while engram is in the foreground; `app/_layout.tsx` shows a "Save this screenshot?" row for 8 s. Save
asks for photo access lazily (`expo-media-library`), takes the newest photo and calls `capture.saveFiles`.

**Background watcher, Android only** (`modules/engram-screenshots`, Settings → Screenshots, off by default):
`ScreenshotJob` is a `JobService` scheduled with a content trigger on `MediaStore.Images` (update delay 500 ms,
max 2 s), so nothing runs between screenshots and there is no foreground service or ongoing notification. Content
triggers are one-shot: each run re-schedules the job while the SharedPreferences flag is on. On each run it queries
the newest image from the last 15 s whose name or path contains "screenshot", dedups by id (`lastId` in the prefs),
skips when engram is in front (the in-app prompt covers that) and posts a heads-up notification ("Save screenshot to
engram?", channel `screenshots-v2`: high importance for the banner but silent, no vibration; priority high, category
recommendation, thumbnail as large icon, auto-cancel, 60 s timeout). `screenshots-v2` replaced the low-importance
`screenshots` channel because Android never raises an existing channel's importance; the old channels are deleted
when the job is scheduled. Tapping it or its Save action fires `ACTION_SEND image/*` with the `content://` uri
straight at `ShareActivity` (with `notificationId` so it cancels itself), so the overlay behaves exactly as for a
share; Dismiss goes through `ScreenshotReceiver`, which also re-schedules the job after a reboot. `isRunning()`
means "a job is pending" (`JobScheduler.getPendingJob`); the settings screen re-reads it on focus. JS mirrors the
flag in `settings.capture.screenshotWatch` and starts / stops the job on change and at boot
(`listenForScreenshots()` in `createEngram`).

Permissions (module manifest): `READ_MEDIA_IMAGES` (33+) / `READ_EXTERNAL_STORAGE` (≤32), `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED`. `requestPermissions()` asks for the runtime ones through Expo's permissions manager before
the toggle turns on.

**iOS**: there is no background screenshot detection; only the in-app prompt exists, and Settings says so.

## iOS, later: page HTML from Safari

Today a Safari share gives the url only; `extract` refetches the page, so paywalled / JS-rendered pages
come back thin. To capture the rendered DOM instead, add an `NSExtensionJavaScriptPreprocessingFile`
to the share extension:

1. Preprocessing script (`targets/share/ShareExtensionPreprocessing.js`, copied into the extension bundle):

   ```js
   var Engram = function () {};
   Engram.prototype = {
     run: function (args) {
       var html = document.documentElement.outerHTML;
       args.completionFunction({
         url: document.URL,
         title: document.title,
         selection: String(window.getSelection()),
         html: html.length > 2 * 1024 * 1024 ? html.slice(0, 2 * 1024 * 1024) : html,
       });
     },
   };
   var ExtensionPreprocessingJS = new Engram();
   ```

2. Extension `Info.plist`, under `NSExtension → NSExtensionAttributes`:

   ```xml
   <key>NSExtensionJavaScriptPreprocessingFile</key>
   <string>ShareExtensionPreprocessing</string>
   ```

   plus `NSExtensionActivationSupportsWebPageWithMaxCount = 1` (already set via `iosActivationRules`).
   Safari then hands the extension an item of type `public.property-list` (`kUTTypePropertyList`) whose
   `NSExtensionJavaScriptPreprocessingResultsKey` dictionary carries the values above.

3. `expo-share-extension` does this with its `preprocessingFile` option (which also sets the WebPage rule and
   delivers the dictionary as the `preprocessingResults` initial prop); `ShareExtensionRoot` would pass it on.

4. App side: `savePendingCapture` passes `meta.html` as `capture.saveUrl(url, { html })`, which stores it as
   the `reader_html` file so `extract` parses the real DOM instead of refetching. A non-empty `selection`
   becomes `capture.saveQuote(selection, url)`.

The 2 MB cap keeps the extension inside its ~120 MB memory budget and the App Group hand-off small;
images inside the HTML are not inlined.

## iOS: engram missing from the share sheet after sideloading

The share sheet entry is an app extension (`PlugIns/engramShareExtension.appex`) with its own bundle id and the
`group.app.engram` App Group. Two things remove it:

1. **The sideloading tool strips it.** With a free Apple ID, AltStore and Sideloadly offer (or default to)
   "remove app extensions" because each extension needs its own App ID against the 10-per-week limit and
   App Groups need a paid account. Keep the extension when asked; it needs a paid Apple Developer account
   to sign with the App Group entitlement. Without the group the extension still works (hand-off mode above);
   without the extension nothing appears in the share sheet. TestFlight/EAS with a paid account is the clean path.
2. **The archive never contained it.** The CI job now fails if the `.appex` is absent from the archive,
   so a green iOS build means the extension is in the IPA.

On the phone, the entry can also be toggled: open any share sheet, scroll the app row to the end,
tap *More*, and make sure **engram** is enabled (new extensions are sometimes off by default).

# Share path

Both platforms use `expo-share-intent` (configured in `app.config.ts`). There is no custom Swift
share target: the stock extension stores the payload in the App Group (`group.app.engram`) and opens the
main app, which reads it with `useShareIntent()` in `app/_layout.tsx` and saves through
`src/features/share/pendingCapture.ts` → `engram.capture.*`. Nothing on this path fetches the network;
`extract` / `thumb` / `classify` / `embed` run from the job queue after the sheet dismisses (`engram.drain()`).

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

Unchanged: the stock expo-share-intent extension opens the main app, and `app/_layout.tsx` shows the
`ShareSheet` modal. The Android overlay (stay over the source app, animate, edit tags) needs
expo-share-extension's custom view running inside the extension process; not attempted here.

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

3. `expo-share-intent` does not read that item type. Two ways to wire it:
   - Fork / patch its `ShareExtensionViewController.swift` to store the dictionary next to the url in the
     App Group `UserDefaults`, and surface it through `meta` (`meta.html`, `meta.selection`).
   - Or switch to `expo-share-extension` (custom Swift target under `apps/mobile/targets/share`) that writes
     the html to `<group container>/files/<hash>` and an `items` + `jobs(extract)` row directly into the App
     Group SQLite; the app then picks it up with `engram.drain()` on foreground.

4. App side: `savePendingCapture` passes `meta.html` as `capture.saveUrl(url, { html })`, which stores it as
   the `reader_html` file so `extract` parses the real DOM instead of refetching. A non-empty `selection`
   becomes `capture.saveQuote(selection, url)`.

The 2 MB cap keeps the extension inside its ~120 MB memory budget and the App Group hand-off small;
images inside the HTML are not inlined.

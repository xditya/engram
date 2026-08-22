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

The config plugin adds `SEND` / `SEND_MULTIPLE` intent filters for `text/*`, `image/*`, `video/*`, `*/*` to
`MainActivity` at prebuild. `apps/mobile/android/` was generated before the plugin was added: run
`npx expo prebuild --platform android` (or delete the folder and let EAS generate it) before the next build,
then confirm the filters in `android/app/src/main/AndroidManifest.xml`. No separate process or memory
ceiling; `savePendingCapture` runs in the app.

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

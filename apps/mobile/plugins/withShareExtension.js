const { IOSConfig, withInfoPlist, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Patches the iOS share extension that expo-share-extension generates:
//   - boots React through Expo's factory (the stock template uses RCTReactNativeFactory, which never creates an
//     Expo AppContext, so expo-modules-core throws "Cannot read property 'EventEmitter' of undefined" on SDK 57);
//   - resolves the App Group at runtime (ALTAppGroups first: sideloading tools rename it) and never force-unwraps
//     its container: media copies fall back to the temp dir instead of the template's early returns, which leave
//     its DispatchGroup waiting forever;
//   - without a usable container (free-account sideloads) the JS root is never mounted: the payload goes to the
//     app in the deep link (&p=<base64url JSON>) or, for media, on the same-team named pasteboard (p=pasteboard),
//     exactly what app/_layout.tsx and EngramDiag.takeSharedPasteboard already read;
//   - the JS path falls back to that same hand-off when the bundle fails to load, never paints, or reports a boot
//     error through openHostApp("handoff"), so the sheet never hangs on the spinner;
//   - share-sheet label, host scheme (the app declares several; the extension needs one string) and the
//     deployment target the pods are built for.
// Mods run last-registered first, so this plugin is listed before expo-share-extension in app.config.ts and
// sees its output.

const PASTEBOARD = 'app.engram.share';
const LABEL = 'Save to engram';
const SCHEME = 'engram';
// Seconds the JS root may take to paint before the share is handed to the app instead.
const JS_TIMEOUT = 20;

const HELPERS = `
  // Sideload support: the group may be renamed (ALTAppGroups) or absent; never assume its container exists.
  var hostAppGroupIdentifier: String {
    if let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String], let first = alt.first { return first }
    return Bundle.main.object(forInfoDictionaryKey: "AppGroup") as? String ?? ""
  }
  var groupContainer: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: hostAppGroupIdentifier) }
  var mediaDirectory: URL { groupContainer ?? FileManager.default.temporaryDirectory }
  // The JS root opens the app's database through the configured group id, so only that container counts; a renamed
  // group reaches a different directory than the app uses and hands off like a missing one.
  var canSaveInExtension: Bool {
    guard let g = Bundle.main.object(forInfoDictionaryKey: "AppGroup") as? String else { return false }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: g) != nil
  }
  // What getShareData produced, kept so a JS failure can still hand it to the app.
  var pendingShare: [String: Any] = [:]
  var jsPainted = false
  var handedOff = false
  // JS path safety net: bundle load failure, or no first paint within the timeout, hands off instead of hanging.
  func armFallback() {
    NotificationCenter.default.addObserver(forName: NSNotification.Name("RCTContentDidAppearNotification"), object: nil, queue: .main) { [weak self] _ in self?.jsPainted = true }
    NotificationCenter.default.addObserver(forName: NSNotification.Name("RCTJavaScriptDidFailToLoadNotification"), object: nil, queue: .main) { [weak self] _ in
      guard let self = self else { return }
      self.handOff(self.pendingShare)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + ${JS_TIMEOUT}) { [weak self] in
      guard let self = self, !self.jsPainted, !self.isCleanedUp else { return }
      self.handOff(self.pendingShare)
    }
  }
  // No usable container: carry the share to the app. URL/text ride in the link; media goes through the pasteboard.
  // Runs on the main thread (getShareData completes there; the observers above are queued there).
  func handOff(_ shared: [String: Any]) {
    if handedOff { return }
    handedOff = true
    var payload = ""
    var written = 0
    let media = ["images", "videos", "files"].flatMap { shared[$0] as? [String] ?? [] }
    if !media.isEmpty {
      // The bytes themselves: the app cannot read this process's sandbox. The file name carries the type hint.
      let items = media.compactMap { p -> [String: Any]? in
        let url = p.hasPrefix("file:") ? URL(string: p) : URL(fileURLWithPath: p)
        guard let u = url, let data = try? Data(contentsOf: u) else { return nil }
        return ["public.data": data, "public.utf8-plain-text": u.lastPathComponent, "${PASTEBOARD}": "1"]
      }
      written = items.count
      if let pb = UIPasteboard(name: UIPasteboard.Name("${PASTEBOARD}"), create: true) { pb.items = items }
      // The general pasteboard is the one channel certain to outlive this process; the app takes and clears it.
      // localOnly keeps the bytes off Universal Clipboard.
      if !items.isEmpty { UIPasteboard.general.setItems(items, options: [.localOnly: true]) }
      payload = "pasteboard"
    } else {
      var json: [String: String] = [:]
      if let u = shared["url"] as? String { json["webUrl"] = u }
      if let t = shared["text"] as? String { json["text"] = String(t.prefix(4000)) }
      guard let d = try? JSONSerialization.data(withJSONObject: json), let s = String(data: d, encoding: .utf8) else { finish(opening: nil); return }
      payload = s
    }
    let p = Data(payload.utf8).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    let scheme = Bundle.main.object(forInfoDictionaryKey: "HostAppScheme") as? String ?? "${SCHEME}"
    finish(opening: URL(string: "\\(scheme)://dataUrl=share?nonce=\\(Int(Date().timeIntervalSince1970))&p=\\(p)&n=\\(written)&m=\\(media.count)"))
  }
  // Open the app through the responder chain, then end the request once. extensionContext.open never calls back
  // in a share extension, so waiting on it left the (invisible) sheet up and the host app unresponsive to touch.
  func finish(opening url: URL?) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      if let url = url { self.openURL(url) }
      // A short beat lets the open call leave this process before the request ends.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
        self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        self?.cleanupAfterClose()
      }
    }
  }
`;

// The template's "no group" branches: an early `return` that skips group.leave() (images / videos) or not (file urls).
const GROUP_GUARD = /guard let appGroup = Bundle\.main\.object\(forInfoDictionaryKey: "AppGroup"\) as\? String else \{\n\s*print\("Could not find AppGroup in info\.plist"\)\n(?:\s*group\.leave\(\)\n)?\s*return\n\s*\}\n\s*\n\s*guard let containerUrl = FileManager\.default\.containerURL\(forSecurityApplicationGroupIdentifier: appGroup\) else \{\n\s*print\("Could not set up file manager container URL for app group"\)\n(?:\s*group\.leave\(\)\n)?\s*return\n\s*\}/g;

function rewrite(src) {
  let s = src;
  const must = (re, replacement, label, times = 1) => {
    const n = (s.match(new RegExp(re.source, re.flags.replace('g', '') + 'g')) ?? []).length;
    if (n !== times) throw new Error(`[withShareExtension] pattern "${label}" matched ${n} times, expected ${times}`);
    s = s.replace(re, replacement);
  };
  // ExpoModulesProvider.swift in this target imports Expo as `internal`; a plain import elsewhere is an error under Swift 6.
  must(/^import React\n/m, 'import React\ninternal import Expo\n', 'imports');
  must(/class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate \{/, 'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {', 'delegate base');
  must(/RCTReactNativeFactory\(delegate: reactNativeFactoryDelegate!\)/, 'ExpoReactNativeFactory(delegate: reactNativeFactoryDelegate!)', 'factory');
  must(/(  private var isCleanedUp = false\n)/, `$1${HELPERS}`, 'helpers');
  must(/(\n\s*)(reactNativeFactoryDelegate = ReactNativeDelegate\(\))/,
    (_, ws, line) => `${ws}self.pendingShare = sharedData ?? [:]${ws}if !self.canSaveInExtension { self.handOff(self.pendingShare); return }${ws}self.armFallback()${ws}${line}`, 'hand-off gate');
  // JS reports a boot failure (no database, no container) through openHostApp("handoff").
  must(/(private func openHostApp\(path: String\?\) \{\n)/, '$1    if path == "handoff" { handOff(pendingShare); return }\n', 'handoff path');
  must(GROUP_GUARD, 'let containerUrl = self.mediaDirectory', 'group guards', 3);
  return s;
}

const targetName = (config) => `${IOSConfig.XcodeUtils.sanitizedName(config.name)}ShareExtension`;

module.exports = (config) => {
  config = withInfoPlist(config, (c) => {
    const file = path.join(c.modRequest.platformProjectRoot, targetName(c), 'Info.plist');
    const plist = require('@expo/plist').default;
    const info = plist.parse(fs.readFileSync(file, 'utf8'));
    info.CFBundleDisplayName = LABEL;
    info.HostAppScheme = SCHEME;
    fs.writeFileSync(file, plist.build(info));
    return c;
  });
  return withXcodeProject(config, (c) => {
    const name = targetName(c);
    const file = path.join(c.modRequest.platformProjectRoot, name, 'ShareExtensionViewController.swift');
    fs.writeFileSync(file, rewrite(fs.readFileSync(file, 'utf8')));
    // The pods are built for the app's deployment target (expo-build-properties); the extension must match, or Swift
    // refuses to import modules built for a newer OS than the target.
    const deploymentTarget = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p : [p])).find(([n]) => n === 'expo-build-properties')?.[1]?.ios?.deploymentTarget;
    if (deploymentTarget) {
      const configs = c.modResults.hash.project.objects.XCBuildConfiguration;
      let patched = 0;
      for (const key of Object.keys(configs)) {
        const bs = configs[key].buildSettings;
        if (bs && bs.PRODUCT_NAME === `"${name}"`) { bs.IPHONEOS_DEPLOYMENT_TARGET = `"${deploymentTarget}"`; patched++; }
      }
      if (!patched) throw new Error(`[withShareExtension] no build configuration for ${name}; deployment target not set`);
    }
    return c;
  });
};

module.exports.rewrite = rewrite;
module.exports.PASTEBOARD = PASTEBOARD;
module.exports.LABEL = LABEL;

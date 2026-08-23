const { withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Sideloaded installs (AltStore/SideStore on a free Apple ID) either rename the App Group and record it under
// ALTAppGroups, or strip the entitlement entirely. The generated share extension assumes the configured group
// exists and force-unwraps its container. This rewrites it so that:
//   - the group id is resolved at runtime (ALTAppGroups first),
//   - a missing container never crashes: files fall back to the temp dir,
//   - URL/text payloads also travel inside the deep link (&p=<base64url JSON>),
//   - media without a usable group is handed over on a same-team named pasteboard (p=pasteboard).
// The app reads `p` in app/_layout.tsx and the pasteboard through the EngramDiag module.
// Runs as an Xcode-project mod because expo-share-intent writes the file in that phase; mods run in
// reverse plugin order, so listing this plugin before expo-share-intent makes it run after the file exists.

const PASTEBOARD = 'app.engram.share';

const HELPERS = `
  // Sideload support: the group may be renamed (ALTAppGroups) or absent; never assume its container exists.
  var hostAppGroupIdentifier: String {
    if let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String], let first = alt.first { return first }
    return "__GROUP__"
  }
  var groupContainer: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: hostAppGroupIdentifier) }
  var mediaDirectory: URL { groupContainer ?? FileManager.default.temporaryDirectory }
  var fallbackPayload: String? = nil
  func setPayload(_ object: Any) {
    if let d = try? JSONSerialization.data(withJSONObject: object), let s = String(data: d, encoding: .utf8) { fallbackPayload = s }
  }
  func pasteboardHandoff() {
    guard groupContainer == nil else { return }
    guard let pb = UIPasteboard(name: UIPasteboard.Name("${PASTEBOARD}"), create: true) else { return }
    pb.items = sharedMedia.compactMap { media in
      guard let url = URL(string: media.path), let data = try? Data(contentsOf: url) else { return nil }
      return ["public.data": data, "public.utf8-plain-text": media.fileName]
    }
    fallbackPayload = "pasteboard"
  }`;

function rewrite(src) {
  let s = src;
  const must = (re, replacement, label) => {
    const out = s.replace(re, replacement);
    if (out === s) throw new Error(`[withSideloadAppGroup] pattern not found: ${label}`);
    s = out;
  };
  must(/let hostAppGroupIdentifier: String = "([^"]+)"\n/, (_, g) => HELPERS.replace('__GROUP__', g) + '\n', 'group constant');
  // Text and URL: also carry the payload in the link (capped so the URL stays openable).
  must(/(userDefaults\?\.synchronize\(\)\n\s*)(self\.redirectToHostApp\(type: \.text\))/,
    (_, a, b) => `${a}self.setPayload(["text": String(self.sharedText.joined(separator: "\\n").prefix(4000))])\n            ${b}`, 'text redirect');
  must(/(userDefaults\?\.synchronize\(\)\n\s*)(self\.redirectToHostApp\(type: \.weburl\))/g,
    (_, a, b) => `${a}self.setPayload(["webUrl": self.sharedWebUrl.first?.url ?? ""])\n            ${b}`, 'weburl redirect');
  // Media and files: never unwrap the container; hand over via pasteboard when there is none.
  must(/FileManager\.default\s*\.containerURL\(\s*forSecurityApplicationGroupIdentifier: self\.hostAppGroupIdentifier\)!/g,
    'self.mediaDirectory', 'container unwrap');
  must(/guard let containerURL = FileManager\.default\.containerURL\(forSecurityApplicationGroupIdentifier: self\.hostAppGroupIdentifier\) else \{/,
    'let containerURL = self.mediaDirectory\n    if false {', 'screenshot guard');
  must(/(self\.redirectToHostApp\(type: \.media\))/g, 'self.pasteboardHandoff(); $1', 'media redirect');
  must(/(self\.redirectToHostApp\(type: \.file\))/g, 'self.pasteboardHandoff(); $1', 'file redirect');
  must(/let url = URL\(string: "\\\(shareProtocol\):\/\/dataUrl=\\\(sharedKey\)\?nonce=\\\(nonce\)#\\\(type\)"\)!/,
    `var extra = ""
    if let p = fallbackPayload, let d = p.data(using: .utf8) {
      extra = "&p=" + d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    let url = URL(string: "\\(shareProtocol)://dataUrl=\\(sharedKey)?nonce=\\(nonce)\\(extra)#\\(type)")!`, 'redirect url');
  return s;
}

module.exports = (config) =>
  withXcodeProject(config, (c) => {
    const dir = c.modRequest.platformProjectRoot;
    let patched = 0;
    for (const entry of fs.readdirSync(dir)) {
      const file = path.join(dir, entry, 'ShareViewController.swift');
      if (!fs.existsSync(file)) continue;
      fs.writeFileSync(file, rewrite(fs.readFileSync(file, 'utf8')));
      patched++;
    }
    if (!patched) console.warn('[withSideloadAppGroup] no ShareViewController.swift was rewritten');
    return c;
  });

module.exports.rewrite = rewrite;
module.exports.PASTEBOARD = PASTEBOARD;

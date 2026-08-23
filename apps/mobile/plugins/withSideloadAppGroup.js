const { withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// AltStore/SideStore can't sign a free account for a fixed App Group, so they rename it and list the new
// name under ALTAppGroups in Info.plist. The generated share extension bakes the group id into a constant;
// this turns it into a lookup that prefers the renamed group, so sharing works on sideloaded installs too.
// Runs as an Xcode-project mod because expo-share-intent writes the file in that phase; mods run in
// reverse plugin order, so listing this plugin before expo-share-intent makes it run after the file exists.
module.exports = (config) =>
  withXcodeProject(config, (c) => {
    const dir = c.modRequest.platformProjectRoot;
    let patched = 0;
    for (const entry of fs.readdirSync(dir)) {
      const file = path.join(dir, entry, 'ShareViewController.swift');
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      const out = src.replace(
        /let hostAppGroupIdentifier: String = "([^"]+)"/,
        (_, group) => `var hostAppGroupIdentifier: String {\n    if let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String], let first = alt.first { return first }\n    return "${group}"\n  }`,
      );
      if (out !== src) { fs.writeFileSync(file, out); patched++; }
    }
    if (!patched) console.warn('[withSideloadAppGroup] no ShareViewController.swift was rewritten');
    return c;
  });

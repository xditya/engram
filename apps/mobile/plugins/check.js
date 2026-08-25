// node plugins/check.js — rewrites expo-share-extension's Swift template in memory and checks the result.
const assert = require('assert');
const fs = require('fs');
const { rewrite } = require('./withShareExtension');

const src = fs.readFileSync(require.resolve('expo-share-extension/plugin/swift/ShareExtensionViewController.swift'), 'utf8');
const out = rewrite(src);
for (const marker of ['internal import Expo', 'ExpoReactNativeFactoryDelegate {', 'ExpoReactNativeFactory(delegate:', 'ALTAppGroups', 'func handOff(', 'if !self.canSaveInExtension { self.handOff(self.pendingShare); return }', 'self.armFallback()', 'UIPasteboard.Name("app.engram.share")', 'URL(string: "\\(scheme)://dataUrl=share?nonce=\\(', 'func finish(opening url: URL?)', 'asyncAfter(deadline: .now() + 0.4)', 'UIPasteboard.general.setItems(items, options: [.localOnly: true])', 'RCTJavaScriptDidFailToLoadNotification', 'if path == "handoff" { handOff(pendingShare); return }'])
  assert(out.includes(marker), `missing: ${marker}`);
assert(!out.includes('RCTReactNativeFactory('), 'stock factory still used');
assert(!out.includes('UIApplication.shared'), 'UIApplication.shared is unavailable in an extension');
// The request ends exactly once: completeRequest lives in the template's close() and in finish(); handOff never
// calls close() itself.
assert.strictEqual((out.match(/completeRequest\(/g) ?? []).length, 2, 'completeRequest call sites');
assert(!/func handOff\([\s\S]*?\bclose\(\)[\s\S]*?func finish\(/.test(out), 'handOff must end through finish(), not close()');
assert(!out.includes('ctx.open('), 'extensionContext.open never completes in a share extension');
assert(!/Could not find AppGroup in info\.plist/.test(out), 'an early-return group guard survived');
assert.strictEqual((out.match(/let containerUrl = self\.mediaDirectory/g) ?? []).length, 3);
assert.strictEqual((out.match(/containerURL\(forSecurityApplicationGroupIdentifier: [^)]*\)!/g) ?? []).length, 0, 'force-unwrapped container');
// Braces still balance: the guard regex must have eaten whole blocks.
const count = (ch) => (out.match(new RegExp(`\${ch}`, 'g')) ?? []).length;
assert.strictEqual(count('{'), count('}'), 'unbalanced braces');
assert.throws(() => rewrite(src.replace('import React\n', '')), /imports/);
console.log('withShareExtension: rewrite ok');

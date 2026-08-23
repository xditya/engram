// node plugins/check.js — rewrites expo-share-extension's Swift template in memory and checks the result.
const assert = require('assert');
const fs = require('fs');
const { rewrite } = require('./withShareExtension');

const src = fs.readFileSync(require.resolve('expo-share-extension/plugin/swift/ShareExtensionViewController.swift'), 'utf8');
const out = rewrite(src);
for (const marker of ['import Expo', 'ExpoReactNativeFactoryDelegate {', 'ExpoReactNativeFactory(delegate:', 'ALTAppGroups', 'func handOff(', 'self.handOff(sharedData ?? [:]); return', 'UIPasteboard.Name("app.engram.share")', 'URL(string: "\\(scheme)://dataUrl=share?nonce=\\('])
  assert(out.includes(marker), `missing: ${marker}`);
assert(!out.includes('RCTReactNativeFactory('), 'stock factory still used');
assert(!/Could not find AppGroup in info\.plist/.test(out), 'an early-return group guard survived');
assert.strictEqual((out.match(/let containerUrl = self\.mediaDirectory/g) ?? []).length, 3);
assert.strictEqual((out.match(/containerURL\(forSecurityApplicationGroupIdentifier: [^)]*\)!/g) ?? []).length, 0, 'force-unwrapped container');
// Braces still balance: the guard regex must have eaten whole blocks.
const count = (ch) => (out.match(new RegExp(`\${ch}`, 'g')) ?? []).length;
assert.strictEqual(count('{'), count('}'), 'unbalanced braces');
assert.throws(() => rewrite(src.replace('import React\n', '')), /imports/);
console.log('withShareExtension: rewrite ok');

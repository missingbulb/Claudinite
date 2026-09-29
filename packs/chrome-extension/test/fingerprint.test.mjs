import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPacks } from '../../../engine/pack_loader/pack-registry.mjs';
import * as detectorSpec from '../../../engine/pack_loader/relevance-detector.mjs';

const pack = (await loadPacks()).find((p) => p.id === 'chrome-extension'); // @real-entity the pack under test

const fires = (files) => detectorSpec.detectsRelevance(pack.relevanceDetector, {
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
});

const MV3 = '{\n  "manifest_version": 3,\n  "name": "x"\n}\n';

test('chrome-extension: fingerprint fires on an MV3 manifest at the root or one directory down', () => {
  assert.equal(fires({ 'manifest.json': MV3 }), true);
  assert.equal(fires({ 'extension/manifest.json': MV3 }), true);
});

test('chrome-extension: fingerprint is silent on an MV2 manifest, a web-app manifest and a deeply nested one', () => {
  assert.equal(fires({ 'manifest.json': '{ "manifest_version": 2, "name": "x" }\n' }), false);
  assert.equal(fires({ 'manifest.json': '{ "name": "My PWA", "start_url": "/" }\n' }), false);
  assert.equal(fires({ 'test/fixtures/ext/manifest.json': MV3 }), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../engine/checks/helpers/repo-context.mjs';
import { loadPacks } from '../engine/pack_loader/pack-registry.mjs';
import { detectsRelevance } from '../engine/pack_loader/relevance-detector.mjs';

const canon = await loadPacks();
const [flutter, node, firebase] = ['flutter', 'node', 'firebase'].map((id) => canon.find((p) => p.id === id)); // @real-entity the shared marker-depth convention is asserted across these packs

// Deliberately stays in engine/test/, not co-located into any one pack: each
// test asserts the *shared* marker-depth detect convention (marker at the repo
// root OR one directory down, but not deeper, and only the exact basename)
// across several packs at once. It proves a cross-pack behaviour, so it belongs
// with the engine tests rather than duplicated three times under packs/.
function detect(pack, files) {
  const root = makeRepo({ base: files });
  try {
    return detectsRelevance(pack.relevanceDetector, buildContext({ root, mode: 'all' }));
  } finally {
    cleanup(root);
  }
}

test('flutter/node/firebase detect: marker at the repo root', () => { // @real-entity the real pack detectors under test
  assert.equal(detect(flutter, { 'pubspec.yaml': 'name: x\n' }), true);
  assert.equal(detect(node, { 'package.json': '{}\n' }), true);
  assert.equal(detect(firebase, { 'firebase.json': '{}\n' }), true);
});

test('flutter/node/firebase detect: marker one directory down (monorepo layout)', () => { // @real-entity the real pack detectors under test
  assert.equal(detect(flutter, { 'app/pubspec.yaml': 'name: x\n' }), true);
  assert.equal(detect(node, { 'functions/package.json': '{}\n' }), true);
  assert.equal(detect(firebase, { 'firebase/firebase.json': '{}\n' }), true); // @real-entity the real pack detectors under test
});

test('flutter/node/firebase detect: marker two or more directories deep does NOT match', () => { // @real-entity the real pack detectors under test
  assert.equal(detect(flutter, { 'packages/inner/pubspec.yaml': 'name: x\n' }), false);
  assert.equal(detect(node, { 'test/fixtures/package.json': '{}\n' }), false);
  assert.equal(detect(firebase, { 'examples/demo/firebase.json': '{}\n' }), false);
});

test('flutter/node/firebase detect: no marker at all', () => { // @real-entity the real pack detectors under test
  assert.equal(detect(flutter, { 'lib/main.dart': '//\n' }), false);
  assert.equal(detect(node, { 'src/index.ts': '//\n' }), false);
  assert.equal(detect(firebase, { 'firestore.rules': '//\n' }), false);
});

test('flutter/node/firebase detect: a same-named file that is not the marker basename does NOT match', () => { // @real-entity the real pack detectors under test
  // Only the basename counts — a path that merely contains the marker string
  // (e.g. a directory named like the marker) must not register.
  assert.equal(detect(flutter, { 'pubspec.yaml.bak': 'name: x\n' }), false);
  assert.equal(detect(node, { 'app/package.json.tmpl': '{}\n' }), false);
  assert.equal(detect(firebase, { 'firebase.json.bak': '{}\n' }), false);
});

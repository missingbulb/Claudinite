import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, canonPack } from './helpers.mjs';
import { buildContext } from '../engine/checks/helpers/repo-context.mjs';

const [flutter, node, firebase] = await Promise.all(['flutter', 'node', 'firebase'].map(canonPack));

// Deliberately stays in engine-tests/, not co-located into any one pack: each
// test asserts the *shared* marker-depth detect convention (marker at the repo
// root OR one directory down, but not deeper, and only the exact basename)
// across several packs at once. It proves a cross-pack behaviour, so it belongs
// with the engine tests rather than duplicated three times under packs/.
//
// Since #564 the three declare that convention as DATA —
// `{ trackedPath: { basename: ..., maxDepth: 2 } }` — so this is also the
// end-to-end proof that the detect-spec compiler means what the three packs
// used to spell out in three copies of the same arrow function.
function detect(pack, files) {
  const root = makeRepo({ base: files });
  try {
    return pack.detect(buildContext({ root, mode: 'all' }));
  } finally {
    cleanup(root);
  }
}

test('flutter/node/firebase detect: marker at the repo root', () => {
  assert.equal(detect(flutter, { 'pubspec.yaml': 'name: x\n' }), true);
  assert.equal(detect(node, { 'package.json': '{}\n' }), true);
  assert.equal(detect(firebase, { 'firebase.json': '{}\n' }), true);
});

test('flutter/node/firebase detect: marker one directory down (monorepo layout)', () => {
  assert.equal(detect(flutter, { 'app/pubspec.yaml': 'name: x\n' }), true);
  assert.equal(detect(node, { 'functions/package.json': '{}\n' }), true);
  assert.equal(detect(firebase, { 'firebase/firebase.json': '{}\n' }), true);
});

test('flutter/node/firebase detect: marker two or more directories deep does NOT match', () => {
  assert.equal(detect(flutter, { 'packages/inner/pubspec.yaml': 'name: x\n' }), false);
  assert.equal(detect(node, { 'test/fixtures/package.json': '{}\n' }), false);
  assert.equal(detect(firebase, { 'examples/demo/firebase.json': '{}\n' }), false);
});

test('flutter/node/firebase detect: no marker at all', () => {
  assert.equal(detect(flutter, { 'lib/main.dart': '//\n' }), false);
  assert.equal(detect(node, { 'src/index.ts': '//\n' }), false);
  assert.equal(detect(firebase, { 'firestore.rules': '//\n' }), false);
});

test('flutter/node/firebase detect: a same-named file that is not the marker basename does NOT match', () => {
  // Only the basename counts — a path that merely contains the marker string
  // (e.g. a directory named like the marker) must not register.
  assert.equal(detect(flutter, { 'pubspec.yaml.bak': 'name: x\n' }), false);
  assert.equal(detect(node, { 'app/package.json.tmpl': '{}\n' }), false);
  assert.equal(detect(firebase, { 'firebase.json.bak': '{}\n' }), false);
});

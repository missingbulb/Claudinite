import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import flutter from '../../packs/flutter/pack.mjs';
import node from '../../packs/node/pack.mjs';
import firebase from '../../packs/firebase/pack.mjs';

// The flutter, node, and firebase packs fingerprint a marker file at the repo
// root OR one directory down, so a monorepo (Flutter in app/, Node in
// functions/, Firebase project root in firebase/) is detected — but a marker
// nested deeper (a fixture/example tree) is not.
//
// This file lives with the ENGINE tests deliberately: it tests the shared
// detect *convention* by sweeping several packs per test, not any one pack's
// behavior. A single pack's own fingerprint tests belong in that pack's
// pack.test.mjs (see packs/chrome-extension-release/pack.test.mjs).
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

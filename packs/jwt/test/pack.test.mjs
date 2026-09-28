import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPacks } from '../../../engine/pack_loader/pack-registry.mjs';
import * as detectorSpec from '../../../engine/pack_loader/relevance-detector.mjs';

const pack = (await loadPacks()).find((p) => p.id === 'jwt'); // @real-entity the pack under test

// A minimal detect context: `tracked` names the files, `read` serves their text.
const ctx = (files) => ({
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
});

const fires = (files) => detectorSpec.detectsRelevance(pack.relevanceDetector, ctx(files));

test('jwt: fingerprint fires on a JWT library a dependency manifest declares', () => {
  assert.equal(fires({ 'package.json': '{ "dependencies": { "jsonwebtoken": "^9.0.2" } }\n' }), true);
  assert.equal(fires({ 'api/package.json': '{ "dependencies": { "jose": "^5.9.0" } }\n' }), true);
  assert.equal(fires({ 'requirements.txt': 'flask==3.0\nPyJWT==2.9.0\n' }), true);
  assert.equal(fires({ 'pyproject.toml': '[project]\ndependencies = ["python-jose[cryptography]>=3.3"]\n' }), true);
});

test('jwt: fingerprint is silent on source that uses a library no manifest declares, and on a name in prose', () => {
  assert.equal(fires({ 'server/auth.js': "const jwt = require('jsonwebtoken');\n" }), false);
  assert.equal(fires({ 'package.json': '{ "description": "jose tokens, someday" }\n' }), false);
  assert.equal(fires({ 'package.json': '{ "dependencies": { "jose-utils": "^1.0.0" } }\n' }), false);
  assert.equal(fires({ 'a/b/package.json': '{ "dependencies": { "jsonwebtoken": "^9.0.2" } }\n' }), false);
});

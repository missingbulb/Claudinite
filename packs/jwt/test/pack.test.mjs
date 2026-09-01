import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../pack.mjs';

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/jwt');

// A minimal detect context: `tracked` names the files, `read` serves their text.
const ctx = (files) => ({
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
});

test('jwt: the pack bundles its two action skills', () => {
  // The skills/ listing IS the manifest's skills declaration (the loader's
  // convention), so the directory is the only place to assert it.
  assert.deepEqual(readdirSync(join(PACK_DIR, 'skills')).sort(), ['jwt-minting', 'jwt-validation']);
});

test('jwt: fingerprint fires on a JWT library reference in source, and only there', () => {
  assert.equal(pack.detect(ctx({ 'server/auth.js': "const jwt = require('jsonwebtoken');\n" })), true);
  assert.equal(pack.detect(ctx({ 'api/token.py': 'import jwt\n\ntoken = jwt.encode(claims, key)\n' })), true);
  assert.equal(pack.detect(ctx({ 'lib/verify.ts': "import { jwtVerify } from 'jose';\n" })), true);
  // The library names only count in source files, and only as module references.
  assert.equal(pack.detect(ctx({ 'docs/notes.md': "we might use 'jsonwebtoken' someday\n" })), false);
  assert.equal(pack.detect(ctx({ 'src/app.js': "console.log('hello');\n" })), false);
  // `import jwt` must be an import statement, not a substring.
  assert.equal(pack.detect(ctx({ 'src/app.py': 'important = True\n' })), false);
});

// The pack keeps no task of its own: watching a technology for what dates this
// pack's guidance is the canon's curation duty (claudinite-canon-curation's
// upstream-watch), and what it reads is the README's `## Upstream` section.
test('jwt: the pack declares its upstream sources, and schedules no task to watch them itself', () => {
  assert.equal(existsSync(join(PACK_DIR, 'tasks')), false);
  const readme = readFileSync(join(PACK_DIR, 'README.md'), 'utf8');
  const upstream = readme.split(/^## Upstream$/m)[1];
  assert.ok(upstream, 'the README carries an ## Upstream section — the whole opt-in');
  // Each source is one line carrying a URL and the state the content was
  // reconciled against; the watch advances those anchors.
  const sources = upstream.split('\n- ').slice(1);
  assert.ok(sources.length >= 2);
  for (const source of sources) {
    assert.match(source, /https?:\/\//);
    assert.match(source, /reconciled through/);
  }
  assert.ok(existsSync(join(PACK_DIR, 'badge.svg')));
});

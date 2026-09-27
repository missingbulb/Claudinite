import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from '../pack.mjs';
import * as locateSpec from '../../../engine/pack_loader/locate.mjs';

// A minimal detect context: `tracked` names the files, `read` serves their text.
const ctx = (files) => ({
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
});

test('jwt: fingerprint fires on a JWT library reference in source, and only there', () => {
  assert.equal(locateSpec.locateMatches(pack.locate, ctx({ 'server/auth.js': "const jwt = require('jsonwebtoken');\n" })), true);
  assert.equal(locateSpec.locateMatches(pack.locate, ctx({ 'api/token.py': 'import jwt\n\ntoken = jwt.encode(claims, key)\n' })), true);
  assert.equal(locateSpec.locateMatches(pack.locate, ctx({ 'lib/verify.ts': "import { jwtVerify } from 'jose';\n" })), true);
  // The library names only count in source files, and only as module references.
  assert.equal(locateSpec.locateMatches(pack.locate, ctx({ 'docs/notes.md': "we might use 'jsonwebtoken' someday\n" })), false);
  assert.equal(locateSpec.locateMatches(pack.locate, ctx({ 'src/app.js': "console.log('hello');\n" })), false);
  // `import jwt` must be an import statement, not a substring.
  assert.equal(locateSpec.locateMatches(pack.locate, ctx({ 'src/app.py': 'important = True\n' })), false);
});

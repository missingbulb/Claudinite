import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from '../pack.mjs';

// A minimal detect context: `tracked` names the files, `read` serves their text.
const ctx = (files) => ({
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
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

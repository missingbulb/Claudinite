import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import verifyBindsAudience from '../../../../packs/jwt/skills/jwt-validation/verify-binds-audience.mjs';

const run = (root) => verifyBindsAudience.run(buildContext({ root, mode: 'all' }));

test('jwt-verify-binds-audience: a verify that pins algorithms but binds no recipient is an advisory smell', () => {
  const root = makeRepo({ changed: {
    'server/auth.js':
      "const jwt = require('jsonwebtoken');\njwt.verify(token, secret, { algorithms: ['RS256'] });\n",
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.match(findings[0].what, /neither audience nor issuer/);
  } finally { cleanup(root); }
});

test('jwt-verify-binds-audience: jose\'s jwtVerify without audience or issuer is flagged too', () => {
  const root = makeRepo({ changed: {
    'server/auth.mjs':
      "import { jwtVerify } from 'jose';\nconst { payload } = await jwtVerify(token, key);\n",
  } });
  try {
    assert.equal(run(root).length, 1);
  } finally { cleanup(root); }
});

test('jwt-verify-binds-audience: binding the audience (or issuer) passes', () => {
  const root = makeRepo({ changed: {
    'server/a.js':
      "const jwt = require('jsonwebtoken');\njwt.verify(token, secret, { algorithms: ['RS256'], audience: 'api://orders' });\n",
    'server/b.mjs':
      "import { jwtVerify } from 'jose';\nawait jwtVerify(token, key, { issuer: 'https://issuer.example', audience: 'api://orders' });\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-verify-binds-audience: the words appearing elsewhere in the file pass it (options built above)', () => {
  const root = makeRepo({ changed: {
    'server/auth.js':
      "const jwt = require('jsonwebtoken');\nconst opts = { audience: AUD, issuer: ISS };\njwt.verify(token, secret, opts);\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

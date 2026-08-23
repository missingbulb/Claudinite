import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { fileURLToPath } from 'node:url';
import { loadDeclaredChecks } from '../../../../../engine/checks/helpers/pattern-rules.mjs';

const signSetsExpiry = loadDeclaredChecks(
  fileURLToPath(new URL('../../../../../packs/jwt/skills/jwt-minting', import.meta.url)),
).find((r) => r.id === 'jwt-sign-sets-expiry');

const run = (root) => signSetsExpiry.run(buildContext({ root, mode: 'all' }));

test('jwt-sign-sets-expiry: a sign with no expiry anywhere in the file is an advisory smell', () => {
  const root = makeRepo({ changed: {
    'server/mint.js':
      "const jwt = require('jsonwebtoken');\nconst t = jwt.sign(payload, key, { algorithm: 'RS256' });\n",
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /no expiry/);
  } finally { cleanup(root); }
});

test('jwt-sign-sets-expiry: a PyJWT encode with no exp claim in the file is flagged', () => {
  const root = makeRepo({ changed: {
    'api/token.py': 'import jwt\n\ntok = jwt.encode(claims, key, algorithm="HS256")\n',
  } });
  try {
    assert.equal(run(root).length, 1);
  } finally { cleanup(root); }
});

test('jwt-sign-sets-expiry: an expiresIn option passes', () => {
  const root = makeRepo({ changed: {
    'server/mint.js':
      "const jwt = require('jsonwebtoken');\nconst t = jwt.sign(payload, key, { expiresIn: '5m' });\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-sign-sets-expiry: an exp claim in the payload (same file) passes', () => {
  const root = makeRepo({ changed: {
    'api/token.py':
      'import jwt\nimport time\n\nclaims = {"sub": sub, "exp": int(time.time()) + 300}\ntok = jwt.encode(claims, key)\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-sign-sets-expiry: a .sign call without a jsonwebtoken import is out of scope', () => {
  const root = makeRepo({ changed: {
    'server/crypto.js': 'const sig = signer.sign(privateKey, data);\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

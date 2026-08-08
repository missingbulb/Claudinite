import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import hardcodedSecret from '../../../../packs/jwt/skills/jwt-minting/hardcoded-secret.mjs';

const run = (root) => hardcodedSecret.run(buildContext({ root, mode: 'all' }));

test('jwt-hardcoded-secret: a literal string secret to jsonwebtoken sign is flagged', () => {
  const root = makeRepo({ changed: {
    'server/mint.js':
      "const jwt = require('jsonwebtoken');\nconst t = jwt.sign(payload, 'my-secret', { algorithm: 'HS256' });\n",
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /literal string/);
  } finally { cleanup(root); }
});

test('jwt-hardcoded-secret: a literal key to PyJWT encode/decode is flagged', () => {
  const root = makeRepo({ changed: {
    'api/token.py': 'import jwt\n\ntok = jwt.encode(claims, "hunter2", algorithm="HS256")\n',
  } });
  try {
    assert.equal(run(root).length, 1);
  } finally { cleanup(root); }
});

test('jwt-hardcoded-secret: a secret from the environment passes', () => {
  const root = makeRepo({ changed: {
    'server/mint.js':
      "const jwt = require('jsonwebtoken');\nconst t = jwt.sign(payload, process.env.JWT_SECRET);\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-hardcoded-secret: a template literal with an interpolation is config plumbing, not a secret', () => {
  const root = makeRepo({ changed: {
    'server/mint.js':
      "const jwt = require('jsonwebtoken');\nconst t = jwt.sign(payload, `${config.secret}`);\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-hardcoded-secret: test files are exempt — a fixture secret exercises the hazard', () => {
  const root = makeRepo({ changed: {
    'server/auth.test.js':
      "const jwt = require('jsonwebtoken');\nconst t = jwt.sign({ sub: 'x' }, 'test-secret');\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

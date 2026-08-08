import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import noneNotAccepted from '../../../../packs/jwt/skills/jwt-validation/none-not-accepted.mjs';

// Co-located with the check it exercises (skills own their check-the-world rules).
const run = (root) => noneNotAccepted.run(buildContext({ root, mode: 'all' }));

test('jwt-none-not-accepted: flags "none" in a jsonwebtoken algorithms allowlist', () => {
  const root = makeRepo({ changed: {
    'server/verify.js':
      "const jwt = require('jsonwebtoken');\njwt.verify(t, secret, { algorithms: ['HS256', 'none'] });\n",
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /"none"/);
  } finally { cleanup(root); }
});

test('jwt-none-not-accepted: flags PyJWT algorithms=["none"]', () => {
  const root = makeRepo({ changed: {
    'api/auth.py': 'import jwt\n\nclaims = jwt.decode(tok, key, algorithms=["none"])\n',
  } });
  try {
    assert.equal(run(root).length, 1);
  } finally { cleanup(root); }
});

test('jwt-none-not-accepted: a pinned real algorithm passes', () => {
  const root = makeRepo({ changed: {
    'server/verify.js':
      "const jwt = require('jsonwebtoken');\njwt.verify(t, secret, { algorithms: ['HS256'] });\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-none-not-accepted: test files are exempt — a fixture exercising the hazard is not shipping it', () => {
  const root = makeRepo({ changed: {
    'tests/reject-none.test.js':
      "const jwt = require('jsonwebtoken');\nassert.throws(() => jwt.verify(t, s, { algorithms: ['none'] }));\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

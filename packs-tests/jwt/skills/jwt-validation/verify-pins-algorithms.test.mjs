import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import verifyPinsAlgorithms from '../../../../packs/jwt/skills/jwt-validation/verify-pins-algorithms.mjs';

const run = (root) => verifyPinsAlgorithms.run(buildContext({ root, mode: 'all' }));

test('jwt-verify-pins-algorithms: flags a jsonwebtoken verify with no allowlist anywhere', () => {
  const root = makeRepo({ changed: {
    'server/auth.js':
      "const jwt = require('jsonwebtoken');\nconst decoded = jwt.verify(token, secret);\n",
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /no algorithms allowlist/);
  } finally { cleanup(root); }
});

test('jwt-verify-pins-algorithms: the async callback form without an allowlist is flagged too', () => {
  const root = makeRepo({ changed: {
    'server/auth.js':
      "const jwt = require('jsonwebtoken');\njwt.verify(token, secret, function (err, decoded) {\n  cb(decoded);\n});\n",
  } });
  try {
    assert.equal(run(root).length, 1);
  } finally { cleanup(root); }
});

test('jwt-verify-pins-algorithms: an inline algorithms option passes', () => {
  const root = makeRepo({ changed: {
    'server/auth.js':
      "const jwt = require('jsonwebtoken');\njwt.verify(token, secret, { algorithms: ['RS256'] });\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-verify-pins-algorithms: an options object built elsewhere in the file passes (benefit of the doubt)', () => {
  const root = makeRepo({ changed: {
    'server/auth.js':
      "const jwt = require('jsonwebtoken');\nconst opts = { algorithms: ['HS256'], maxAge: '5m' };\njwt.verify(token, secret, opts);\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('jwt-verify-pins-algorithms: a .verify call in a file that never imports jsonwebtoken is out of scope', () => {
  const root = makeRepo({ changed: {
    'server/crypto.js': 'const ok = verifier.verify(publicKey, signature);\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

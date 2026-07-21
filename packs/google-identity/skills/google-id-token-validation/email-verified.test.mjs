import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../checks/test/helpers.mjs';
import { buildContext } from '../../../../checks/lib/context.mjs';
import emailVerified from './email-verified.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => emailVerified.run(buildContext({ root, mode: 'all' }));

// A Google-identity marker somewhere in the repo — the check's repo-level gate.
const GOOGLE_MARKER = {
  'server/template.yaml': 'Issuer: https://accounts.google.com\nAudience: [x]\n',
};

test('google-token-email-verified: gating on email_verified as a string passes', () => {
  const root = makeRepo({ changed: {
    ...GOOGLE_MARKER,
    'server/handler.mjs':
      "const claims = event.requestContext.authorizer.jwt.claims;\nif (claims.email_verified !== 'true') return deny();\npost(claims.email);\n",
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-token-email-verified: flags reading the email claim with no email_verified check', () => {
  const root = makeRepo({ changed: {
    ...GOOGLE_MARKER,
    'server/handler.mjs':
      'const claims = event.requestContext.authorizer.jwt.claims;\npost(claims.email);\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /never checks email_verified/);
  } finally { cleanup(root); }
});

test('google-token-email-verified: flags a strict boolean compare behind an API Gateway authorizer', () => {
  const root = makeRepo({ changed: {
    ...GOOGLE_MARKER,
    'server/handler.mjs':
      'const claims = event.requestContext.authorizer.jwt.claims;\nif (claims.email_verified === true) post(claims.email);\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /strict equality/);
  } finally { cleanup(root); }
});

test('google-token-email-verified: inert in a repo with no Google-identity marker', () => {
  const root = makeRepo({ changed: {
    'server/handler.mjs':
      'const claims = event.requestContext.authorizer.jwt.claims;\npost(claims.email);\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-token-email-verified: test files are out of scope', () => {
  const root = makeRepo({ changed: {
    ...GOOGLE_MARKER,
    'server/handler.test.mjs':
      'const claims = event.requestContext.authorizer.jwt.claims;\npost(claims.email);\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

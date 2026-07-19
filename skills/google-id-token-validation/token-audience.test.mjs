import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import tokenAudience from './token-audience.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => tokenAudience.run(buildContext({ root, mode: 'all' }));

const ISSUER = 'https://accounts.google.com';

test('google-token-audience-pinned: issuer with a pinned audience passes', () => {
  const root = makeRepo({ changed: {
    'server/template.yaml':
      `Auth:\n  Authorizers:\n    GoogleAuth:\n      JwtConfiguration:\n        Issuer: ${ISSUER}\n        Audience:\n          - 123-abc.apps.googleusercontent.com\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-token-audience-pinned: flags an issuer with no audience anywhere in the config', () => {
  const root = makeRepo({ changed: {
    'server/template.yaml':
      `Auth:\n  Authorizers:\n    GoogleAuth:\n      JwtConfiguration:\n        Issuer: ${ISSUER}\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].line, 5);
    assert.match(findings[0].what, /no .*audience/);
  } finally { cleanup(root); }
});

test('google-token-audience-pinned: flags an explicitly empty audience list', () => {
  const root = makeRepo({ changed: {
    'infra/gateway.tf':
      `resource "aws_apigatewayv2_authorizer" "g" {\n  jwt_configuration {\n    audience = []\n    issuer   = "${ISSUER}"\n  }\n}\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /empty/);
  } finally { cleanup(root); }
});

test('google-token-audience-pinned: a client-side OAuth URL (path form, no issuer word) is not a validator', () => {
  const root = makeRepo({ changed: {
    'client/config.json': `{ "authUrl": "${ISSUER}/o/oauth2/v2/auth" }\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-token-audience-pinned: code files are out of scope (no reliable signature)', () => {
  const root = makeRepo({ changed: {
    'server/verify.mjs': `await jwtVerify(token, jwks, { issuer: '${ISSUER}' });\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

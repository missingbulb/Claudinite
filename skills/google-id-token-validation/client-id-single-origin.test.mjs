import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import clientIdSingleOrigin from './client-id-single-origin.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => clientIdSingleOrigin.run(buildContext({ root, mode: 'all' }));

const WEB_ID = '111-web.apps.googleusercontent.com';
const EXT_ID = '222-ext.apps.googleusercontent.com';

test('google-client-id-single-origin: one copy per literal passes, even across two files', () => {
  const root = makeRepo({ changed: {
    'extension/manifest.json': `{ "oauth2": { "client_id": "${EXT_ID}" } }\n`,
    'server/samconfig.toml': `parameter_overrides = "GoogleClientId=${WEB_ID}"\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-client-id-single-origin: flags the same literal hardcoded in two files', () => {
  const root = makeRepo({ changed: {
    'extension/config.mjs': `export const CLIENT_ID = '${WEB_ID}';\n`,
    'extension/background.mjs': `const clientId = '${WEB_ID}';\n`,
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.match(findings[0].what, /also present in/);
  } finally { cleanup(root); }
});

test('google-client-id-single-origin: repeated uses inside one file are a single origin', () => {
  const root = makeRepo({ changed: {
    'extension/config.mjs': `export const CLIENT_ID = '${WEB_ID}';\nconsole.log('${WEB_ID}');\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

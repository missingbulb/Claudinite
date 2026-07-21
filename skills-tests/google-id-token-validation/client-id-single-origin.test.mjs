import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/checks/helpers.mjs';
import { buildContext } from '../../engine/checks/lib/context.mjs';
import clientIdSingleOrigin from '../../skills/google-id-token-validation/client-id-single-origin.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => clientIdSingleOrigin.run(buildContext({ root, mode: 'all' }));

const WEB_ID = '111-web.apps.googleusercontent.com';
const EXT_ID = '222-ext.apps.googleusercontent.com';

test('google-client-id-single-origin: adding a literal with no other copy passes', () => {
  const root = makeRepo({ changed: {
    'extension/config.mjs': `export const CLIENT_ID = '${WEB_ID}';\n`,
    'server/samconfig.toml': `parameter_overrides = "GoogleClientId=${EXT_ID}"\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-client-id-single-origin: flags a change adding a copy of a literal already in another file', () => {
  const root = makeRepo({
    base: { 'extension/config.mjs': `export const CLIENT_ID = '${WEB_ID}';\n` },
    changed: { 'extension/background.mjs': `const clientId = '${WEB_ID}';\n` },
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(findings[0].file, 'extension/background.mjs');
    assert.equal(findings[0].line, 1);
    assert.match(findings[0].what, /already present in extension\/config\.mjs/);
  } finally { cleanup(root); }
});

test('google-client-id-single-origin: legacy duplicates the change never touched stay quiet', () => {
  const root = makeRepo({
    base: {
      'extension/config.mjs': `export const CLIENT_ID = '${WEB_ID}';\n`,
      'extension/background.mjs': `const clientId = '${WEB_ID}';\n`,
    },
    changed: { 'docs/notes.md': 'unrelated work\n' },
  });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-client-id-single-origin: repeated uses inside one added file are a single origin', () => {
  const root = makeRepo({ changed: {
    'extension/config.mjs': `export const CLIENT_ID = '${WEB_ID}';\nconsole.log('${WEB_ID}');\n`,
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('google-client-id-single-origin: two copies added together flag at both sites', () => {
  const root = makeRepo({ changed: {
    'extension/config.mjs': `export const CLIENT_ID = '${WEB_ID}';\n`,
    'extension/background.mjs': `const clientId = '${WEB_ID}';\n`,
  } });
  try {
    assert.equal(run(root).length, 2);
  } finally { cleanup(root); }
});

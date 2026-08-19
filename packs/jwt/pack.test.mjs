import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pack from '../../packs/jwt/pack.mjs';
import advisoryWatch from '../../packs/jwt/tasks/jwt-advisory-watch/task.mjs';
import { validateTaskDeclaration } from '../../engine/scheduler/task-contract.mjs';

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs/jwt');

// A minimal detect context: `tracked` names the files, `read` serves their text.
const ctx = (files) => ({
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
});

test('jwt: the manifest bundles its two action skills, and they exist on disk', () => {
  assert.equal(pack.id, 'jwt');
  assert.deepEqual(pack.skills, ['jwt-minting', 'jwt-validation']);
  assert.deepEqual(readdirSync(join(PACK_DIR, 'skills')).sort(), ['jwt-minting', 'jwt-validation']);
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

test('jwt-advisory-watch: a well-formed monthly, assess-only declaration', () => {
  assert.deepEqual(validateTaskDeclaration(advisoryWatch), []);
  assert.equal(advisoryWatch.id, 'jwt-advisory-watch');
  assert.equal(advisoryWatch.frequency, 'monthly');    // advisories publish on the world's clock
  assert.deepEqual(advisoryWatch.precondition_signals, []); // nothing repo-side gates it
  assert.equal(advisoryWatch.expected_outcome, 'none'); // recommends in its tracker, never opens a PR
});

test('jwt-advisory-watch: runs unconditionally — the trigger lives outside the repo', () => {
  const v = advisoryWatch.precondition();
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /read-only|never change/);
});

test('jwt-advisory-watch: worker doc present, reconciles its own tracker by exact title', () => {
  const worker = readFileSync(join(PACK_DIR, 'tasks/jwt-advisory-watch', advisoryWatch.agent_instructions), 'utf8');
  assert.ok(worker.includes('`Claudinite tracker: JWT advisory watch`'));
  // The tracker's state carries no meaning, so the worker may not open or close it.
  assert.match(worker, /Never open, close, or reopen the tracker/);
  // An empty result must mean "checked and clean", never "couldn't check".
  assert.match(worker, /lookup unavailable/);
  assert.ok(existsSync(join(PACK_DIR, 'badge.svg')));
});

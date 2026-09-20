import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../../../engine/checks/helpers/pattern-rules.mjs';

const rule = loadDeclaredChecks(
  fileURLToPath(new URL('..', import.meta.url)),
).find((r) => r.id === 'barrier-edge-over-test-files');

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));
const declaring = (entry) => makeRepo({
  base: { 'packs/p/declared-checks.json': JSON.stringify([entry], null, 2) },
});

const barrier = (edge) => ({
  id: 'p-barrier', severity: 'blocking', failureMessage: 'stay apart', forbidReferences: [edge],
});

test('barrier-edge-over-test-files: a barrier between product folders passes', () => {
  const root = declaring(barrier({ from: 'engine', to: 'packs/p', reason: 'the engine names no pack' }));
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('barrier-edge-over-test-files: an edge aimed at a test folder is reported', () => {
  const root = declaring(barrier({ from: 'packs/p/test', to: 'engine', reason: 'tests stay local' }));
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /packs\/p\/test/);
  } finally { cleanup(root); }
});

// `from` takes a list as readily as a scalar, and the value then sits on its own
// line — the form the edge is most often written in is the one worth catching.
test('barrier-edge-over-test-files: a test folder inside a list of endpoints is reported', () => {
  const root = declaring(barrier({ from: ['engine', 'test'], to: 'packs/p', reason: 'stay apart' }));
  try { assert.equal(run(root).length, 1); } finally { cleanup(root); }
});

test('barrier-edge-over-test-files: a *.test.mjs endpoint is reported', () => {
  const root = declaring(barrier({ between: ['packs/p/foo.test.mjs', 'engine'], reason: 'stay apart' }));
  try { assert.equal(run(root).length, 1); } finally { cleanup(root); }
});

// A reviewed exception pins its own `to`, so the key an edge is read by turns up
// again inside `except` — where it narrows the barrier and never widens it.
test('barrier-edge-over-test-files: an except entry pinning a test path is not an edge', () => {
  const root = declaring(barrier({
    from: 'engine',
    to: 'packs/p',
    except: [{ path: 'engine/x.mjs', to: ['packs/p/test'], reason: 'it seeds the fixtures' }],
    reason: 'stay apart',
  }));
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// A structural carve-out is a bare string under `except`, carrying no endpoint key.
test('barrier-edge-over-test-files: a test name in an except carve-out is not an edge', () => {
  const root = declaring(barrier({ from: 'engine', to: 'packs/p', except: ['*.test.mjs'], reason: 'stay apart' }));
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// "contest", "latest" and "test-fixtures" are not the tests the scanner drops.
test('barrier-edge-over-test-files: a folder whose name merely contains test passes', () => {
  const root = declaring(barrier({ from: 'packs/p/test-fixtures', to: 'engine/latest', reason: 'stay apart' }));
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

// The repo's own settings file carries the baseline pack's barrier rules in the
// same vocabulary, so it is the second surface the same mistake lands on.
test('barrier-edge-over-test-files: the settings file is scanned too', () => {
  const root = makeRepo({
    base: {
      '.claudinite-settings.json': JSON.stringify({
        packs: [{ id: 'basics', config: { barriers: { rules: [{ from: 'test', to: 'packs/*', reason: 'x' }] } } }],
      }, null, 2),
    },
  });
  try { assert.equal(run(root).length, 1); } finally { cleanup(root); }
});

// A pattern left behind by a layout change matches nothing and still reads as live,
// so the scope is measured over the real tree — with the declaration's own regex.
test('barrier-edge-over-test-files: the scope is non-empty against the real tree', () => {
  const root = fileURLToPath(new URL('../../../../..', import.meta.url));
  const tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n');
  assert.ok(tracked.filter((p) => rule.spec.scanFiles.test(p)).length >= 10);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../engine/checks/helpers/pattern-rules.mjs';
import specKeys from '../worldRules/declared-check-spec-keys.mjs';

const run = (root) => specKeys.run(buildContext({ root, mode: 'all' }));

const declaration = (extra) => JSON.stringify([{
  id: 'fx-keys',
  severity: 'blocking',
  failureMessage: 'the fixture matters',
  scanFiles: '/\\.txt$/',
  matchLines: [{ match: '/TOK/', what: 'saw it', fix: 'remove it' }],
  ...extra,
}], null, 2);

test('declared-check-spec-keys: a key the vocabulary cannot place is one finding naming its container', () => {
  const root = makeRepo({ changed: {
    'packs/demo/declared-checks.json': declaration({
      scanFile: '/\\.md$/',
      matchLines: [{ match: '/TOK/', unlesLineMatches: '/y/', what: 'saw it', fix: 'remove it' }],
    }),
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 2);
    assert.match(findings[0].what, /"fx-keys" carries "unlesLineMatches" inside "matchLines"/);
    assert.match(findings[1].what, /"fx-keys" carries "scanFile", which is not a spec key/);
    assert.equal(findings[0].severity, 'advisory');
    assert.equal(findings[0].file, 'packs/demo/declared-checks.json');
  } finally { cleanup(root); }
});

test('declared-check-spec-keys: a declaration the vocabulary places wholly is silent', () => {
  const root = makeRepo({ changed: { 'packs/demo/declared-checks.json': declaration({ since: '2026-09-01' }) } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

// The wedge #1400 filed: a member's local pack declaring a key its engine does
// not know must still LOAD — every rule in the file, not just the ones before
// the unknown key — because the converge that would deliver the engine knowing
// it is itself gated on that load succeeding.
test('a declaration carrying a key this engine cannot place still loads every rule in its file', () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/demo/declared-checks.json': JSON.stringify([
      {
        id: 'fx-future-key', severity: 'blocking', failureMessage: 'from a newer engine',
        scanFiles: '/\\.txt$/', sinceRelease: '60901.1',
        matchLines: [{ match: '/TOK/', what: 'saw it', fix: 'remove it' }],
      },
      {
        id: 'fx-neighbour', severity: 'advisory', failureMessage: 'the rule beside it',
        scanFiles: '/\\.txt$/',
        matchLines: [{ match: '/OTHER/', what: 'saw the other', fix: 'remove it' }],
      },
    ], null, 2),
    'a.txt': 'TOK\nOTHER\n',
  } });
  try {
    const rules = loadDeclaredChecks(`${root}/.claudinite/local/packs/demo`);
    assert.deepEqual(rules.map((r) => r.id), ['fx-future-key', 'fx-neighbour']);
    const ctx = buildContext({ root, mode: 'all' });
    assert.deepEqual(rules[0].run(ctx).map((f) => f.what), ['saw it']);
    assert.deepEqual(rules[1].run(ctx).map((f) => f.what), ['saw the other']);
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /"fx-future-key" carries "sinceRelease", which is not a spec key/);
  } finally { cleanup(root); }
});

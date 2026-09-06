import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import declaredCheckSince from '../worldRules/declared-check-since.mjs';

const run = (root) => declaredCheckSince.run(buildContext({ root, mode: 'all' }));

const spec = (over) => ({
  id: 'fx',
  severity: 'blocking',
  scope: 'action',
  failureMessage: 'one consequence clause',
  guardToolCalls: [{ tool: 'Bash', inputField: 'command', match: '/x/', what: 'w', fix: 'f' }],
  ...over,
});

const repoWith = (specs, file = 'packs/demo/declared-checks.json') =>
  makeRepo({ changed: { [file]: JSON.stringify(specs, null, 2) } });

test('declared-check-since: a blocking action check with no since is a finding', () => {
  const root = repoWith([spec()]);
  try {
    const found = run(root);
    assert.equal(found.length, 1);
    assert.match(found[0].what, /"fx" blocks on tool calls and carries no "since"/);
    assert.equal(found[0].file, 'packs/demo/declared-checks.json');
  } finally { cleanup(root); }
});

test('declared-check-since: a since the grace window cannot read buys nothing, so it is the same finding', () => {
  const root = repoWith([spec({ since: 'last tuesday' })], 'local/packs/demo/declared-checks.json');
  try {
    const found = run(root);
    assert.equal(found.length, 1);
    assert.match(found[0].what, /"since" of "last tuesday" is not a YYYY-MM-DD date/);
  } finally { cleanup(root); }
});

test('declared-check-since: a dated blocking action check, and undated checks of every other shape, are silent', () => {
  const root = repoWith([
    spec({ id: 'fx-dated', since: '2026-09-06' }),
    spec({ id: 'fx-advisory', severity: 'advisory' }),
    { id: 'fx-work', severity: 'blocking', scope: 'work', failureMessage: 'c', scanFiles: '/x/', matchLines: [{ match: '/a/', what: 'w', fix: 'f' }] },
  ]);
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('declared-check-since: unparsable declaration files are the loader\'s finding, not this rule\'s', () => {
  const root = makeRepo({ changed: { 'packs/demo/declared-checks.json': '{not json' } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

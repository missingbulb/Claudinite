import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import declaredCheckMessages from '../../packs/basics/declared-check-messages.mjs';

const run = (root) => declaredCheckMessages.run(buildContext({ root, mode: 'all' }));

const LONG = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');

test('declared-check-messages: an over-cap field and a fix repeated across assertions are each one finding', () => {
  const root = makeRepo({ changed: {
    'packs/demo/declared-checks.json': JSON.stringify([
      {
        id: 'fx-wordy',
        severity: 'blocking',
        failureMessage: LONG,
        scanFiles: '/x/',
        matchLines: [
          { match: '/a/', what: 'w1', fix: 'the same remedy pasted twice' },
          { match: '/b/', what: 'w2', fix: 'the same remedy pasted twice' },
        ],
      },
    ], null, 2),
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 2);
    assert.match(findings[0].what, /"fx-wordy" has a failureMessage of 40 words/);
    assert.match(findings[1].what, /"fx-wordy" repeats one fix verbatim across 2 assertions/);
    assert.equal(findings[0].file, 'packs/demo/declared-checks.json');
  } finally { cleanup(root); }
});

test('declared-check-messages: a rule-level fix shared by assertions is the mechanism, not a duplicate', () => {
  const root = makeRepo({ changed: {
    'local/packs/demo/declared-checks.json': JSON.stringify([
      {
        id: 'fx-shared-fix',
        severity: 'advisory',
        failureMessage: 'one consequence clause',
        fix: 'the one shared remedy',
        scanFiles: '/x/',
        matchLines: [
          { match: '/a/', what: 'w1' },
          { match: '/b/', what: 'w2' },
        ],
      },
    ], null, 2),
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('declared-check-messages: unparsable declaration files are the loader\'s finding, not this rule\'s', () => {
  const root = makeRepo({ changed: { 'packs/demo/declared-checks.json': '{not json' } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

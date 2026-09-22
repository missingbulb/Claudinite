import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lastingFindings, ACTIONABLE, REVIEW_PATH } from '../../tasks/usage-triage/preconditions.mjs';
import { lastingFindings as shelfLasting, ACTIONABLE as shelfActionable, REVIEW_PATH as shelfPath }
  from '../../../claudinite-canon-curation/tasks/usage-triage/preconditions.mjs';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../../../../engine/remove-tree.mjs';

// The two usage-triage tasks ask one question — which findings have lasted long
// enough, with a cause a diff can argue from — about one file, over two different
// corpora. The packs are independent by construction, so the term is duplicated
// rather than imported, and this is the guard that keeps the copies honest: it
// runs BOTH implementations over the same inputs and compares their answers,
// rather than comparing their text, so a rename stays green and a behaviour
// change goes red.
const withReview = (findings, body) => {
  const root = mkdtempSync(join(tmpdir(), 'usage-triage-'));
  try {
    mkdirSync(join(root, '.claudinite', 'local'), { recursive: true });
    writeFileSync(join(root, REVIEW_PATH), JSON.stringify({ findings }));
    return body(root);
  } finally { removeTree(root); }
};

const finding = (over) => ({ rule: 'r', subject: 's', cause: 'known', lasting: true, ...over });

const CASES = [
  { name: 'a lasting known finding', findings: [finding()] },
  { name: 'a lasting probable finding', findings: [finding({ cause: 'probable' })] },
  { name: 'a lasting unknown finding', findings: [finding({ cause: 'unknown' })] },
  { name: 'a young known finding', findings: [finding({ lasting: false })] },
  { name: 'several, mixed', findings: [finding(), finding({ subject: 'b', cause: 'unknown' }), finding({ subject: 'c', lasting: false })] },
  { name: 'none at all', findings: [] },
];

test('the two usage-triage gates agree on every case, run side by side', () => {
  for (const { name, findings } of CASES) {
    const [mine, shelf] = withReview(findings, (root) => [lastingFindings(root), shelfLasting(root)]);
    assert.deepEqual(mine, shelf, name);
  }
  assert.equal(CASES.length, 6, 'every shape the gate distinguishes has a case');
});

test('the gate admits a lasting finding a diff can argue from, and nothing else', () => {
  const kept = withReview(CASES[4].findings, lastingFindings);
  assert.deepEqual(kept.map((f) => f.subject), ['s'],
    'an unknown cause is evidence, and a young finding is weather');
  assert.deepEqual(withReview([], lastingFindings), []);
  assert.deepEqual(lastingFindings('/nonexistent-root'), [], 'a repo with no review yet has nothing to triage');
});

test('both tasks declare the same policy, since a proposal is the owner\'s to take either way', () => {
  const decl = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const mine = decl('../../tasks/usage-triage/task.json');
  const shelf = decl('../../../claudinite-canon-curation/tasks/usage-triage/task.json'); // @real-entity the twin task this policy must agree with
  // The fields that decide what a run may do to the repository without a person —
  // a drift between the two twins here is the one that matters.
  for (const field of ['automerge', 'expected_outcome', 'agent_model', 'preconditions']) {
    assert.deepEqual(mine[field], shelf[field], field);
  }
  assert.deepEqual(ACTIONABLE, shelfActionable);
  assert.equal(REVIEW_PATH, shelfPath);
});

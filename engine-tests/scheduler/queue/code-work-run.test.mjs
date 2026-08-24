// What code-work hands the agentic phase, on the queue's dispatch path — the twin of
// dispatch.mjs's `deliveredLines` for the slot path. The two render the same payload
// into different carriers (a work item's section vs a dispatch issue's body), so a key
// added to one and not the other is dropped silently on half the fleet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deliveredLines, missingSecrets } from '../../../engine/scheduler/queue/code-work-run.mjs';

test('an artifact code_work created is named by identity', () => {
  assert.deepEqual(deliveredLines({ pr: 7, branch: 'claudinite/x' }), [
    'PR: #7 (open)',
    'Branch: `claudinite/x`',
  ]);
  assert.match(deliveredLines({ pr: 7, merged: true })[0], /already merged/);
});

// A task that keeps a standing record resolves it in its OWN code-work and passes the
// number on through this payload. Both live workers were already writing
// `delivered.issue` and nothing rendered it, so the number reached no agent and the
// agentic phase went hunting for the issue by title instead.
test('an ISSUE code_work resolved reaches the agent', () => {
  assert.deepEqual(deliveredLines({ issue: 42 }), ["Issue: #42 — write this run's record there."]);
});

test('absence stays absence — no placeholder for what was not created', () => {
  for (const delivered of [null, undefined, {}, { pr: null, branch: null, issue: null }]) {
    assert.deepEqual(deliveredLines(delivered), [], JSON.stringify(delivered));
  }
});

test('a declared secret that is unset is named; a set-but-empty one is the repo\'s own choice', () => {
  assert.deepEqual(missingSecrets(['A', 'B'], { B: '' }), ['A']);
  assert.deepEqual(missingSecrets([], {}), []);
});

// #1301. Before the bag, the child inherited the executor's whole environment, so
// every code-work task saw every secret the workflow stamped though only a few
// declared one. The selection is what makes DESIGN §14.4 true rather than aspirational.
test('code-work is handed the secrets it declared, and none of the others', async () => {
  const { codeWorkRunner } = await import('../../../engine/scheduler/queue/code-work-run.mjs');
  const { SECRETS_BAG_ENV } = await import('../../../engine/scheduler/queue/secrets-bag.mjs');
  const out = join(mkdtempSync(join(tmpdir(), 'code-work-env-')), 'env.json');
  const env = {
    PATH: process.env.PATH,
    [SECRETS_BAG_ENV]: JSON.stringify({ MINE: 'm', SOMEONE_ELSES: 'x', github_token: 'g' }),
  };
  const run = codeWorkRunner({ root: '/r', repo: 'o/r', defaultBranch: 'main', env });
  const result = await run({
    pack: 'p', id: 't', taskDir: process.cwd(),
    decl: {
      required_secrets: ['MINE'],
      code_work_timeout: 60,
      code_work: `node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.env))" ${out}`,
    },
  }, { item: { number: 1 } });
  assert.equal(result.ok, true);
  const child = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(child.MINE, 'm');
  assert.equal(child.SOMEONE_ELSES, undefined);
  assert.equal(child.github_token, undefined);
  // The bag itself would re-export everything the selection just excluded.
  assert.equal(child[SECRETS_BAG_ENV], undefined);
});

test('a legacy stamping workflow still reaches its declared secret', async () => {
  const { missingSecrets } = await import('../../../engine/scheduler/queue/code-work-run.mjs');
  assert.deepEqual(missingSecrets(['A'], { A: 'set-the-old-way' }), []);
});

test('the bag is what decides a declared secret is missing, not the plain environment', async () => {
  const { missingSecrets } = await import('../../../engine/scheduler/queue/code-work-run.mjs');
  const { SECRETS_BAG_ENV } = await import('../../../engine/scheduler/queue/secrets-bag.mjs');
  const env = { [SECRETS_BAG_ENV]: JSON.stringify({ A: '', B: 'v' }) };
  assert.deepEqual(missingSecrets(['A', 'B', 'C'], env), ['C']);
});

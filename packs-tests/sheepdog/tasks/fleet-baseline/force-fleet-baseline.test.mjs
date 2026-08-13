import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRepoFilter, classifyScope, FORCED_TASK } from '../../../../packs/sheepdog/tasks/fleet-baseline/force-fleet-baseline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
import { classifyDispatch } from '../../../../packs/sheepdog/fleet-api.mjs';
import { parseOverrideBag } from '../../../../packs/sheepdog/tasks/fleet-baseline/worker.mjs';
import { parseOverrides } from '../../../../engine/scheduler/run.mjs';

// The dispatch sweep's pure decision tables. The I/O half is one enumeration and
// one POST per member over primitives fleet-api.test.mjs covers; what must not
// drift silently is WHO is in scope, WHAT a dispatch status means, and HOW the
// override bag's parameters reach the sweep.

test('the forced member-side task is one a member actually runs', () => {
  // `update` since #768 Phase 5 retired the task this lever used to force. Pinned
  // against the REAL task ids a member's scheduler can discover, because a lever
  // naming a task nothing runs still reports a clean dispatch — this sweep counts
  // dispatches, not outcomes (Sheepdog#172), so a wrong id here is invisible.
  assert.equal(FORCED_TASK, 'update');
  assert.ok(existsSync(join(ROOT, 'packs/basics/tasks', FORCED_TASK, 'task.mjs')),
    `no basics task named "${FORCED_TASK}" — this lever would dispatch a task nothing runs`);
});

// --- the repos filter ----------------------------------------------------------

test('parseRepoFilter: space-separated, owner-qualified, lowercased; empty means everyone', () => {
  assert.equal(parseRepoFilter('', 'acme'), null);
  assert.equal(parseRepoFilter(undefined, 'acme'), null);
  const f = parseRepoFilter('Alpha  acme/Beta', 'acme');
  assert.deepEqual([...f].sort(), ['acme/alpha', 'acme/beta']);
});

// --- scope classification -------------------------------------------------------

const repo = (over = {}) => ({ full_name: 'acme/app', archived: false, fork: false, ...over });
const ctx = (over = {}) => ({ canonRepo: 'acme/Claudinite', exclude: new Set(), filter: null, ...over });

test('classifyScope: canon, archived, fork, excluded, filtered-out — each named, none silent', () => {
  assert.equal(classifyScope(repo(), ctx()), null);
  assert.equal(classifyScope(repo({ full_name: 'acme/Claudinite' }), ctx()).state, 'canon');
  assert.equal(classifyScope(repo({ archived: true }), ctx()).state, 'out-of-scope');
  assert.equal(classifyScope(repo({ fork: true }), ctx()).state, 'out-of-scope');
  assert.equal(classifyScope(repo(), ctx({ exclude: new Set(['acme/app']) })).state, 'excluded');
  assert.equal(classifyScope(repo(), ctx({ filter: new Set(['acme/other']) })).state, 'filtered-out');
  assert.equal(classifyScope(repo(), ctx({ filter: new Set(['acme/app']) })), null);
});

test('classifyScope: the ENFORCER repo is not exempt — it is an ordinary member', () => {
  // Leaving it out would make the one repo the owner is looking at the one repo
  // that did not move.
  assert.equal(classifyScope(repo({ full_name: 'acme/sheepdog' }), ctx()), null);
});

// --- dispatch status table (shared floor: fleet-api) -----------------------------

test('classifyDispatch: every status is a DIFFERENT thing for the reader to do', () => {
  assert.equal(classifyDispatch(204).state, 'fired');
  assert.equal(classifyDispatch(404).state, 'no-scheduler');
  assert.equal(classifyDispatch(403).state, 'no-permission');
  assert.match(classifyDispatch(403).detail, /Actions: write/);
  assert.equal(classifyDispatch(422).state, 'not-dispatchable');
  assert.equal(classifyDispatch(500).state, 'error');
});

// --- the worker's override plumbing ---------------------------------------------

test('the worker\'s bag parser agrees with the engine\'s, and maps the sweep\'s parameters', () => {
  const raw = 'FORCE_TASKS=fleet-baseline,REPOS=Alpha Beta,DRY_RUN=true,INCLUDE_DORMANT';
  assert.deepEqual(parseOverrideBag(raw), parseOverrides(raw));
  const bag = parseOverrideBag(raw);
  assert.equal(bag.REPOS, 'Alpha Beta');       // space-separated survives; commas would not
  assert.equal(bag.DRY_RUN, 'true');
  assert.equal(bag.INCLUDE_DORMANT, 'true');   // bare key ⇒ 'true'
});

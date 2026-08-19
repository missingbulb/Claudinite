import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRepoFilter, classifyScope, FORCED_TASK } from '../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-baseline/force-fleet-baseline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
import { classifyDispatch } from '../../../../packs/claudinite-fleet-sheepdog/fleet-api.mjs';
import { parseParamBag } from '../../../../packs/claudinite-fleet-sheepdog/param-bag.mjs';

// The dispatch sweep's pure decision tables. The I/O half is one enumeration and
// one POST per member over primitives fleet-api.test.mjs covers; what must not
// drift silently is WHO is in scope, WHAT a dispatch status means, and HOW the
// item's Context parameters reach the sweep.

test('the forced member-side task is one a member actually runs', () => {
  // `update` since #768 Phase 5 retired the task this lever used to force. Pinned
  // against the REAL task ids a member's scheduler can discover, because a lever
  // naming a task nothing runs still reports a clean dispatch — this sweep counts
  // dispatches, not outcomes (Sheepdog#172), so a wrong id here is invisible.
  assert.equal(FORCED_TASK, 'update');
  // Searched across every pack rather than pinned to the one that happens to own
  // it today: the scheduler discovers tasks by scanning each ACTIVE pack's
  // `tasks/`, so which pack holds `update` is not this lever's business and has
  // already changed once (#835 moved it from basics to core). Naming a pack here
  // would go red on a move that is invisible to the dispatch, and the failure it
  // must actually catch — no pack owns this id at all — is the one below.
  const owners = readdirSync(join(ROOT, 'packs'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(ROOT, 'packs', d.name, 'tasks', FORCED_TASK, 'task.mjs')))
    .map((d) => d.name);
  assert.equal(owners.length, 1,
    `expected exactly one pack to own a "${FORCED_TASK}" task, found ${owners.length} (${owners.join(', ') || 'none'}) — `
    + 'a lever naming a task no pack runs dispatches into nothing and still reports success');
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
  assert.equal(classifyScope(repo({ full_name: 'acme/claudinite-fleet-sheepdog' }), ctx()), null);
});

// --- dispatch status table (shared floor: fleet-api) -----------------------------

test('classifyDispatch: every status is a DIFFERENT thing for the reader to do', () => {
  assert.equal(classifyDispatch(204).state, 'fired');
  assert.equal(classifyDispatch(404).state, 'no-scheduler');
  assert.equal(classifyDispatch(403).state, 'no-permission');
  assert.match(classifyDispatch(403).detail, /Actions: read and write/);
  assert.equal(classifyDispatch(422).state, 'not-dispatchable');
  assert.equal(classifyDispatch(500).state, 'error');
});

// --- the worker's parameter plumbing --------------------------------------------
// The sweep's two SAFETY knobs live here: `REPOS` bounds the blast radius and
// `DRY_RUN` withholds the writes. Under the slot scheduler they rode
// `CLAUDINITE_OVERRIDES`, which the queue never sets — so both read as absent and
// every run was unscoped and live (#974). They ride the item's Context now, and
// what this pins is that the operator's line survives the parse.

test('the sweep\'s parameters come off the item\'s Context lines', () => {
  const context = ['REPOS=Alpha Beta', 'DRY_RUN=true', 'INCLUDE_DORMANT'].join('\n');
  const bag = parseParamBag(context);
  assert.equal(bag.REPOS, 'Alpha Beta');       // space-separated survives; commas would not
  assert.equal(bag.DRY_RUN, 'true');
  assert.equal(bag.INCLUDE_DORMANT, 'true');   // bare key ⇒ 'true'
});

test('the prose an item is born with contributes no parameter', () => {
  // The failure mode this forbids: a birth note or a precondition's reason parsed as
  // keys, so an unparameterized run reports itself as steered — or worse, a stray
  // word lands on a key that means something.
  assert.deepEqual(parseParamBag(
    'Created by hand — no precondition asserts there is work to do. Do only what the '
    + 'task file specifies, and converge to a no-op if there is nothing.',
  ), {});
});

// --- the cross-repo forcing protocol (#929) -------------------------------------
// The enforcer POSTs a `workflow_dispatch` input by name; the member's scheduler
// workflow declares the inputs it will accept. GitHub 422s a dispatch naming an
// undeclared input, so these two spellings ARE the protocol — and they live in
// different trees, one shipped as a stub and one sent from a pack. When they last
// disagreed (the flip dropped the slot workflow's `overrides` input without porting
// the caller) every fleet-wide force refused, and the only symptom was a per-member
// error string that blamed the member's repo settings.

test('the input fleet-api sends is one the tick stub declares', async () => {
  const { readFileSync } = await import('node:fs');
  const apiSrc = readFileSync(join(ROOT, 'packs/claudinite-fleet-sheepdog/fleet-api.mjs'), 'utf8');
  const sent = [...apiSrc.matchAll(/inputs:\s*\{\s*([A-Za-z_][\w]*)\s*:/g)].map((m) => m[1]);
  assert.ok(sent.length, 'fleet-api must dispatch with at least one named input');

  for (const stub of ['engine/scheduler/stubs/claudinite-tick.yml', '.github/workflows/claudinite-scheduler.yml']) {
    const yml = readFileSync(join(ROOT, stub), 'utf8');
    const block = yml.match(/workflow_dispatch:\s*\n\s+inputs:\s*\n([\s\S]*?)\n(?=\S|\n\S)/);
    assert.ok(block, `${stub} must declare workflow_dispatch inputs — a bare workflow_dispatch 422s every named input`);
    const declared = [...block[1].matchAll(/^\s{6}([A-Za-z_][\w]*):\s*$/gm)].map((m) => m[1]);
    for (const name of sent) {
      assert.ok(declared.includes(name),
        `${stub} declares [${declared.join(', ')}] but fleet-api dispatches "${name}" — GitHub rejects a dispatch naming an undeclared input, so every fleet-wide force would refuse`);
    }
  }
});

test('the member-side tick resolves the very id this lever sends', async () => {
  // FORCED_TASK travels as a `wake` input and is resolved by planWake against the
  // member's own declared tasks. A bare id must be owned by exactly one canon pack,
  // or planWake refuses it as ambiguous and the force silently wakes nothing.
  const { planWake } = await import('../../../../engine/scheduler/queue/tick.mjs');
  const tasks = [{ pack: 'claudinite-lifecycle', id: FORCED_TASK }];
  const items = [{
    number: 1, state: 'open', labels: ['task:blocked'],
    title: `[claudinite-work] core/${FORCED_TASK}`,
  }];
  const { wake, unmatched } = planWake(FORCED_TASK, tasks, items);
  assert.deepEqual(unmatched, [], `the tick must resolve "${FORCED_TASK}" — this is the exact string fleet-baseline dispatches`);
  assert.deepEqual(wake, [{ id: `claudinite-lifecycle/${FORCED_TASK}`, issue: 1 }]);
});

test('the 422 message names the stale-mount cause, not just the disabled-workflow one', () => {
  // The misdiagnosis WAS the bug's second half: a member behind on its mount is
  // current-but-stale, and a message saying only "disabled" sends the reader to
  // repo settings — the diagnosis this project's rules single out as never first.
  const detail = classifyDispatch(422).detail;
  assert.match(detail, /wake/, 'must name the undeclared-input cause');
  assert.match(detail, /converge/, 'must say it heals on the member\'s next converge');
});

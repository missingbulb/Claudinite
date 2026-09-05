import { test } from 'node:test';
import assert from 'node:assert/strict';
import promoteJson from '../tasks/growth-promote/task.json' with { type: 'json' };
import discoverJson from '../tasks/growth-discover-packs/task.json' with { type: 'json' };
import upstreamJson from '../tasks/upstream-watch/task.json' with { type: 'json' };
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTaskDeclaration } from '../../claudinite-tasks/shared-code/task-contract.mjs';
import { evaluatePrecondition, loadTaskTerms, preconditionSignals } from '../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const promote = normalizeTaskDeclaration(promoteJson);
const discover = normalizeTaskDeclaration(discoverJson);
const upstream = normalizeTaskDeclaration(upstreamJson);

const PACK_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// The canon-curation fleet-scoped task preconditions (per-project-scheduling
// DESIGN §6 table 2): growth-promote reads which members changed their local
// packs, growth-discover-packs sweeps the members' stacks for technologies the
// canon does not home. (prose-to-checks-sweep moved to claudinite-growth as a
// per-repo task; migration records need no curation task at all — they are kept
// forever, and vendoring's recency window decides what ships.)
// Each verdict goes through `evaluatePrecondition` — the seam the executor calls
// at pick — over a fabricated `fleet` signal, so what is asserted is what the
// declaration plus its own terms actually decide.

const promoteTerms = await loadTaskTerms(join(PACK_DIR, 'tasks/growth-promote'));
const promoteVerdict = (signals) => evaluatePrecondition({ decl: promote, terms: promoteTerms }, signals);

const member = (over = {}) => ({
  repo: 'acme/app', defaultBranch: 'main',
  activePacks: ['claudinite-growth'], packConfigs: {},
  localPacksChanged: true, stamp: null, schedulesItself: false,
  ...over,
});

// --- growth-promote ----------------------------------------------------------

test('growth-promote: declaration is daily/opus/pr+nothing over the fleet signal', () => {
  assert.equal(promote.frequency, 'daily');
  assert.equal(promote.agent_model, 'opus');
  assert.equal(promote.expected_outcome, 'amend_existing_or_create_new_pr'); // owner-gated: its policy authorizes nothing to auto-merge, and a round joins the review already pending
  // Derived from the one condition it states, never declared beside it.
  assert.deepEqual(promote.preconditions, ['fleet-local-packs-changed']);
  assert.deepEqual(preconditionSignals(promote.preconditions, promoteTerms), ['fleet']);
  // Same as discover: reach is the endpoint the hand-off calls, and this task reads
  // every member's local packs.
  assert.equal(promote.invocation_endpoint, 'fleet');
  assert.equal(promote.session_scope, undefined, 'session_scope lost its last reader with the slot scheduler');
});

test('growth-promote: fires on participating members whose local packs changed', () => {
  const v = promoteVerdict({ fleet: { members: [
    member({ repo: 'acme/a' }),
    member({ repo: 'acme/b', localPacksChanged: false }), // changed nothing → excluded
    member({ repo: 'acme/c' }),
  ] } });
  assert.equal(v.run, true);
  assert.match(v.context.join(' '), /acme\/a/);
  assert.match(v.context.join(' '), /acme\/c/);
  assert.doesNotMatch(v.context.join(' '), /acme\/b/); // the unchanged member isn't a target
});

test('growth-promote: skips a member that opted out of promotion', () => {
  const v = promoteVerdict({ fleet: { members: [
    member({ repo: 'acme/opt', packConfigs: { 'claudinite-growth': { promote: false } } }),
  ] } });
  assert.equal(v.run, false);
});

// Membership is the whole participation test now: every member carries local packs
// (seeded at adoption), so a repo not declaring the growth pack is the only skip.
test('growth-promote: skips a member not declaring the growth pack', () => {
  assert.equal(promoteVerdict({ fleet: { members: [member({ activePacks: ['basics'] })] } }).run, false);
});

test('growth-promote: an unproven fleet state ERRORS — it never reads as "nothing to promote"', () => {
  // The fail direction (task-preconditions DESIGN): a decline here is permanent,
  // silent staleness — a missing credential and a converged fleet would look
  // identical forever, and nothing in the repo goes red over it. An error parks the
  // item where the re-queue lever retries it.
  assert.match(promoteVerdict({ fleet: null }).error, /FLEET_GITHUB_TOKEN/);
  assert.match(promoteVerdict({ fleet: { error: 'wrong token' } }).error, /wrong token/);
  // An enumeration that SUCCEEDED and found nobody is a real answer, so it declines.
  assert.equal(promoteVerdict({ fleet: { members: [] } }).run, false);
});

// --- growth-discover-packs (the FLEET sweep) ---------------------------------
// Not to be confused with its per-repo namesake in claudinite-growth, which
// authors a repo's own LOCAL packs. This one is the central canon-gap sweep.

test('growth-discover-packs: declaration is weekly/opus/pr+nothing, fleet-reaching over the fleet signal', () => {
  assert.equal(discover.id, 'growth-discover-packs');
  assert.equal(discover.frequency, 'weekly');
  assert.equal(discover.agent_model, 'opus');
  assert.equal(discover.expected_outcome, 'amend_existing_or_create_new_pr'); // a new canon pack is owner-reviewed: its policy authorizes nothing to auto-merge, and a round joins the review already pending
  // Reach is which endpoint the hand-off calls, and nothing else — this task reads
  // every member's tree, which an ordinary session in this repo does not.
  assert.equal(discover.invocation_endpoint, 'fleet');
  assert.equal(discover.session_scope, undefined, 'session_scope lost its last reader with the slot scheduler');
  // `['none']`: the opportunity is standing rather than windowed, and the roster
  // the run sweeps is read by the run itself (task.md), not handed to it as scope.
  assert.deepEqual(discover.preconditions, ['none']);
  assert.deepEqual(preconditionSignals(discover.preconditions, new Map()), []);
});

test('growth-discover-packs: the weekly anchor IS the trigger — nothing repo-side gates it', () => {
  // The opportunity is standing, so there is nothing to observe in advance: the
  // sweep runs and no-ops cheaply when the shelf already homes what the fleet uses.
  const v = evaluatePrecondition({ decl: discover }, {});
  assert.equal(v.run, true);
  assert.deepEqual(v.context, []);
});

test('growth-discover-packs: which members it sweeps is the worker\'s, and task.md says so', () => {
  // Scope is not a precondition (task-preconditions DESIGN): the roster moved into
  // the work sections when the fleet enumeration stopped being a gate.
  const worker = readFileSync(join(PACK_DIR, 'tasks/growth-discover-packs', discover.agent_instructions), 'utf8');
  assert.match(worker, /every COVERED member/);
  assert.match(worker, /no declared packs is not running Claudinite/);
});

// --- upstream-watch (the shelf's own currency) --------------------------------
// The canon's answer to a pack that would otherwise schedule a watcher of its own:
// one task over the whole shelf, opted into per pack by an `## Upstream` section.

test('upstream-watch: a well-formed monthly, owner-gated declaration over no signal', () => {
  assert.deepEqual(validateTaskDeclaration(upstream), []);
  assert.equal(upstream.id, 'upstream-watch');
  assert.equal(upstream.frequency, 'monthly');
  assert.deepEqual(upstream.preconditions, ['none']); // the trigger is the outside world
  assert.equal(upstream.expected_outcome, 'fresh_pr');
  assert.equal(upstream.automerge, 'nothing');         // canon content every member reads
  // The shelf is the whole subject, so this one needs no reach past an ordinary session.
  assert.equal(upstream.invocation_endpoint, undefined);
});

test('upstream-watch: runs unconditionally, and task.md carries the opt-in scope', () => {
  // A shelf-side gate would only ask "is the shelf still the shelf?" — and which
  // packs opted in is standing instruction, so it lives in the work sections.
  const v = evaluatePrecondition({ decl: upstream }, {});
  assert.equal(v.run, true);
  const worker = readFileSync(join(PACK_DIR, 'tasks/upstream-watch', upstream.agent_instructions), 'utf8');
  assert.match(worker, /## Upstream/);
  assert.match(worker, /opted out: do not add one/);
  assert.match(worker, /reads the shelf, never a member/);
});

test('upstream-watch: the worker advances an anchor only for a source it read', () => {
  const worker = readFileSync(join(PACK_DIR, 'tasks/upstream-watch', upstream.agent_instructions), 'utf8');
  // An unread source must stay unread: the anchor is what the next run windows on,
  // so advancing it past what was covered silently skips a publication window.
  assert.match(worker, /never for one you skipped, and never past what you actually covered/);
  assert.match(worker, /never infer what it would have said/);
  // The scope is the shelf, and the two temptations it must refuse.
  assert.match(worker, /dependency versions/);
  assert.match(worker, /do not add one/);
});

test('the pack keeps exactly the three curation tasks', () => {
  assert.deepEqual(
    readdirSync(join(PACK_DIR, 'tasks')).sort(),
    ['growth-discover-packs', 'growth-promote', 'upstream-watch'],
  );
});

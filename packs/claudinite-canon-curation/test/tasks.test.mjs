import { test } from 'node:test';
import assert from 'node:assert/strict';
import promoteJson from '../tasks/growth-promote/task.json' with { type: 'json' };
import discoverJson from '../tasks/growth-discover-packs/task.json' with { type: 'json' };
import upstreamJson from '../tasks/upstream-watch/task.json' with { type: 'json' };
import bumpJson from '../tasks/pack-version-bump/task.json' with { type: 'json' };
import historyJson from '../tasks/pack-version-history/task.json' with { type: 'json' };
import { declaredMergeRules, policyVerdict } from '../../claudinite-tasks/shared-code/merge-policy.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTaskDeclaration } from '../../claudinite-tasks/shared-code/task-contract.mjs';
import { evaluatePrecondition, loadTaskTerms, preconditionSignals } from '../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration, taskCadence } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const promote = normalizeTaskDeclaration(promoteJson);
const discover = normalizeTaskDeclaration(discoverJson);
const upstream = normalizeTaskDeclaration(upstreamJson);
const bump = normalizeTaskDeclaration(bumpJson);
const history = normalizeTaskDeclaration(historyJson);

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
// The cadence term reads the task's own run history at a chosen instant: an empty
// history holds, and the signal under test decides.
const SCHEDULE = { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 };
const AT = '2026-09-05T16:00:00Z';
const NO_RUNS = { runs: { list: [] } };
const promoteVerdict = (signals) => evaluatePrecondition({ decl: promote, terms: promoteTerms }, { ...NO_RUNS, ...signals }, {}, null, AT, SCHEDULE);

const member = (over = {}) => ({
  repo: 'acme/app', defaultBranch: 'main',
  activePacks: ['claudinite-growth'], packConfigs: {},
  localPacksChanged: true, stamp: null, schedulesItself: false,
  ...over,
});

// --- growth-promote ----------------------------------------------------------

test('growth-promote: its signal is derived from the one condition it states', () => {
  assert.deepEqual(preconditionSignals(promote.preconditions, promoteTerms), ['runs', 'fleet']);
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

test('growth-discover-packs: its conditions derive no signal', () => {
  assert.deepEqual(preconditionSignals(discover.preconditions, new Map()), ['runs']);
});

test('growth-discover-packs: the weekly anchor IS the trigger — nothing repo-side gates it', () => {
  // The opportunity is standing, so there is nothing to observe in advance: the
  // sweep runs and no-ops cheaply when the shelf already homes what the fleet uses.
  const v = evaluatePrecondition({ decl: discover }, NO_RUNS, {}, null, AT, SCHEDULE);
  assert.equal(v.run, true);
  assert.deepEqual(v.context, []);
});

// --- upstream-watch (the shelf's own currency) --------------------------------
// The canon's answer to a pack that would otherwise schedule a watcher of its own:
// one task over the whole shelf, opted into per pack by an `## Upstream` section.

test('upstream-watch: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(upstream), []);
});

test('upstream-watch: runs unconditionally', () => {
  // A shelf-side gate would only ask "is the shelf still the shelf?" — and which
  // packs opted in is standing instruction, so it lives in the work sections.
  const v = evaluatePrecondition({ decl: upstream }, NO_RUNS, {}, null, AT, SCHEDULE);
  assert.equal(v.run, true);
});

// --- pack-version-bump / pack-version-history (the shelf's version numbers) --
// A pull request never bumps a pack; the number is cut on the base branch after the
// merge, and the record of what each number shipped is derived from git.

test('pack-version-bump: a well-formed agentless daily declaration that opens no pull request', () => {
  assert.deepEqual(validateTaskDeclaration(bump), []);
  assert.equal(bump.agent_model, 'none');
  assert.equal(bump.expected_outcome, 'no_code_changes');   // it commits onto the base branch
  // The trigger is the merges the push workflow cannot see: shipping movement under
  // the shelf, read off the commits signal, which classifies the bump's own commits
  // as machinery — behind the cadence's own run history.
  assert.deepEqual(taskCadence(bump), { kind: 'due', cadence: 'daily' });
  assert.deepEqual(preconditionSignals(bump.preconditions, new Map()), ['runs', 'commits']);
  // The canon's push-to-main workflow runs the very worker this declaration names.
  const workflow = readFileSync(join(PACK_DIR, '../../.github/workflows/pack-versions.yml'), 'utf8');
  assert.match(workflow, new RegExp(`run: node packs/claudinite-canon-curation/tasks/pack-version-bump/${bump.code_work.replace(/^node /, '')}$`, 'm'));
});

test('pack-version-history: agentless, weekly on shipping movement, landing itself under a policy that covers only the records', () => {
  assert.deepEqual(validateTaskDeclaration(history), []);
  assert.equal(history.agent_model, 'none');
  assert.equal(history.expected_outcome, 'amend_existing_or_create_new_pr');
  assert.deepEqual(taskCadence(history), { kind: 'due', cadence: 'weekly' });
  assert.deepEqual(preconditionSignals(history.preconditions, new Map()), ['runs', 'commits']);
  // The policy names the pack's own declared class, and that class covers exactly a
  // shelf pack's VERSIONS.md — a manifest or a rule in the same diff parks the run.
  const { rules, errors } = declaredMergeRules([{ id: 'claudinite-canon-curation', dir: PACK_DIR }], { packs: ['claudinite-canon-curation'] });
  assert.deepEqual(errors, []);
  const verdict = (files) => policyVerdict({
    policy: history.automerge,
    entries: files.map((file) => ({ file, before: 'a\n', after: 'b\n' })),
    declaredRules: rules,
  });
  assert.equal(verdict(['packs/basics/VERSIONS.md', 'packs/leaflet/VERSIONS.md']).mergeable, true);
  assert.equal(verdict(['packs/basics/VERSIONS.md', 'packs/basics/pack.mjs']).mergeable, false);
  assert.equal(verdict(['.claudinite/local/packs/x/VERSIONS.md']).mergeable, false);
});

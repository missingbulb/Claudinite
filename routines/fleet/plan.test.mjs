import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkPlan } from './plan.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Integration test for the core planner's plan-building: a fake gh + a covered
// member.
//
// Since #394 the CANON packs contribute no `run_daily` descriptors at all —
// every canon pack's scheduled work is a `tasks/<name>/task.mjs` its own repo's
// scheduler runs — so the only tasks this planner can still assemble are a
// repo's OWN local-pack ones. That is the reality these tests now encode: a
// covered member with no local tasks yields an empty (but well-formed) plan, and
// the home's curation task still plans through the local-task read.
function fakeGh(routes) {
  return async (path) => {
    for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
    return { status: 404, json: null };
  };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

test('buildWorkPlan: builds a well-formed plan; the canon packs now contribute no units', async () => {
  const gh = fakeGh([
    // canonChanged: one home commit touching a member path
    [/o\/home\/commits\?since=/, { status: 200, json: [{ sha: 'c1' }] }],
    [/o\/home\/commits\/c1$/, { status: 200, json: { files: [{ filename: 'packs/basics/RULES.md' }] } }],
    // member probes — idle repo (no push in window), so no mainMoved probe fires
    [/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'grow_with_claudinite'] }) } }],
    [/\/local_packs$/, { status: 200, json: [{ name: 'foo-pack', type: 'dir' }] }], // has local packs → dedup can fire
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
  ]);
  const coveredRepos = [{ full_name: 'owner/foo', default_branch: 'main', pushed_at: '2000-01-01T00:00:00Z' }];

  const plan = await buildWorkPlan(gh, 'o/home', coveredRepos);

  assert.equal(plan.canonChanged, true);
  assert.ok(typeof plan.generatedAt === 'string' && typeof plan.windowStartUtc === 'string');
  assert.equal(plan.errors.length, 0);
  // The signals are still computed and the member is still planned — but the
  // packs it declares (basics, grow_with_claudinite) carry no `run_daily`
  // descriptors any more (#394), and this member has no local-pack tasks of its
  // own, so the plan is legitimately empty. The planner's own machinery (window,
  // canonChanged, per-repo isolation) is what this asserts.
  assert.deepEqual(plan.units, [], 'no canon-pack units left for the central planner to emit');
  assert.deepEqual(plan.skipped, [], 'the member is planned, not skipped — it just has nothing to do');
});

test('buildWorkPlan: a member that declares `taskScheduler` is skipped entirely (cutover marker)', async () => {
  const gh = fakeGh([
    [/o\/home\/commits\?since=/, { status: 200, json: [{ sha: 'c1' }] }],
    [/o\/home\/commits\/c1$/, { status: 200, json: { files: [{ filename: 'packs/basics/RULES.md' }] } }],
    // the member self-schedules — declares the `taskScheduler` key
    [/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'grow_with_claudinite'], taskScheduler: { dailyHour: 4 } }) } }],
    [/\/local_packs$/, { status: 200, json: [{ name: 'foo-pack', type: 'dir' }] }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
  ]);
  const plan = await buildWorkPlan(gh, 'o/home', [{ full_name: 'owner/foo', default_branch: 'main', pushed_at: new Date().toISOString() }]);
  assert.deepEqual(plan.units, [], 'no units for a self-scheduling member');
  assert.deepEqual(plan.skipped, ['owner/foo'], 'the member is recorded as skipped');
});

test('buildWorkPlan: a member with no local packs at all plans cleanly and emits nothing', async () => {
  const gh = fakeGh([
    [/o\/home\/commits\?since=/, { status: 200, json: [{ sha: 'c1' }] }],
    [/o\/home\/commits\/c1$/, { status: 200, json: { files: [{ filename: 'packs/basics/RULES.md' }] } }],
    [/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'grow_with_claudinite'] }) } }],
    [/\/local_packs$/, { status: 404, json: null }], // no local packs → no local tasks to read either
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
  ]);
  const plan = await buildWorkPlan(gh, 'o/home', [{ full_name: 'owner/foo', default_branch: 'main', pushed_at: '2000-01-01T00:00:00Z' }]);
  // A missing local-packs dir is fail-soft, not an error: no tasks, no findings.
  assert.deepEqual(plan.units, []);
  assert.deepEqual(plan.errors, []);
});

test('buildWorkPlan: a member whose probe throws is isolated, not fatal', async () => {
  const gh = fakeGh([
    [/o\/home\/commits\?since=/, { status: 200, json: [] }], // canonChanged false
    [/\.claudinite-checks\.json/, () => { throw new Error('network'); }],
  ]);
  const plan = await buildWorkPlan(gh, 'o/home', [{ full_name: 'owner/bad', default_branch: 'main', pushed_at: '2000-01-01T00:00:00Z' }]);
  assert.equal(plan.units.length, 0);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].repo, 'owner/bad');
});

test('buildWorkPlan: plans the home repo last — home-only pack gates see the fleet aggregate', async () => {
  // The home's curation tasks live in ITS OWN local pack (.claudinite/
  // local_packs/canon-curation) and arrive through the DEFAULT local-task read
  // — the fake gh serves the REAL descriptor files from this repo's tree, so
  // the test also proves each descriptor is self-contained (data:-URL
  // importable) and its worker path rewrites correctly.
  const curation = '.claudinite/local/packs/canon-curation';
  const rawB64 = (p) => Buffer.from(readFileSync(join(repoRoot, p), 'utf8'), 'utf8').toString('base64');
  const gh = fakeGh([
    // canonChanged false (no home commits in window)
    [/o\/home\/commits\?since=/, { status: 200, json: [] }],
    // home fullSweep may or may not be tonight (hash-staggered): give its probes empty answers either way
    [/o\/home\/commits\?sha=/, { status: 200, json: [] }],
    [/o\/home\/contents\/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'local/canon-curation'] }) } }],
    [/o\/home\/pulls\?/, { status: 200, json: [] }],
    [/o\/home\/issues\?/, { status: 200, json: [] }],
    [/o\/home\/branches\?/, { status: 200, json: [] }],
    // the home is on the new local-pack layout; the dual-root reader finds it here
    [/o\/home\/contents\/\.claudinite\/local\/packs$/, { status: 200, json: [{ name: 'canon-curation', type: 'dir', path: curation }] }],
    [/o\/home\/contents\/\.claudinite\/local\/packs\/canon-curation\/run_daily$/, { status: 200, json: [
      { name: 'growth-promote-to-claudinite.mjs', type: 'file', path: `${curation}/run_daily/growth-promote-to-claudinite.mjs` },
    ] }],
    [/growth-promote-to-claudinite\.mjs$/, { status: 200, json: { content: rawB64(`${curation}/run_daily/growth-promote-to-claudinite.mjs`) } }],
    // the member changed: pushed in window and main moved → projectChanged
    [/owner\/foo\/commits\?sha=/, { status: 200, json: [{ sha: 'm1' }] }],
    [/owner\/foo\/commits\/m1$/, { status: 200, json: { files: [{ filename: '.claudinite/local_packs/foo-pack/RULES.md' }] } }], // the commit touched local packs → promote target
    [/owner\/foo\/contents\/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'grow_with_claudinite'] }) } }],
    [/owner\/foo\/contents\/\.claudinite\/local_packs/, { status: 200, json: [{ name: 'foo-pack', type: 'dir' }] }], // has local packs → a valid promote participant
    [/owner\/foo\/pulls\?/, { status: 200, json: [] }],
    [/owner\/foo\/issues\?/, { status: 200, json: [] }],
    [/owner\/foo\/branches\?/, { status: 200, json: [] }],
  ]);
  const member = { full_name: 'owner/foo', default_branch: 'main', pushed_at: new Date().toISOString() };
  const homeRepo = { full_name: 'o/home', default_branch: 'main', pushed_at: '2000-01-01T00:00:00Z' };

  const plan = await buildWorkPlan(gh, 'o/home', [member], homeRepo);

  assert.equal(plan.errors.length, 0, JSON.stringify(plan.errors));
  const promote = plan.units.find((u) => u.task === 'growth-promote-to-claudinite');
  assert.ok(promote, 'promote planned as an ordinary unit on the home repo, via the default local-task read');
  assert.equal(promote.repo, 'o/home');
  assert.equal(promote.worker, '.claudinite/local/packs/canon-curation/promote.md');
  assert.equal(promote.workerRepo, 'o/home'); // the dispatch reads the worker from the home repo
  // whether tonight is home's full-sweep night or not, the one enrolled+changed member is the target set
  assert.deepEqual(promote.targets.repos, ['owner/foo']);
  // The canon packs contribute nothing any more (#394), so the ONLY unit in the
  // whole plan is the home's own local-pack promote task.
  assert.deepEqual(plan.units.map((u) => u.task), ['growth-promote-to-claudinite']);
});

test('buildWorkPlan: without a homeRepo the home is not planned (back-compat callers)', async () => {
  const gh = fakeGh([
    [/o\/home\/commits\?since=/, { status: 200, json: [] }],
  ]);
  const plan = await buildWorkPlan(gh, 'o/home', []);
  assert.deepEqual(plan.units, []);
  assert.deepEqual(plan.errors, []);
});

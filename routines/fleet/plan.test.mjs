import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkPlan } from './plan.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Integration test for the core planner's plan-building: a fake gh + a covered
// member, exercising the real pack run_daily tasks (loaded from disk). We drive
// canonChanged true (a home commit touching packs/) so baselining + growth-dedup fire.
function fakeGh(routes) {
  return async (path) => {
    for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
    return { status: 404, json: null };
  };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

test('buildWorkPlan: emits units from the real fleet-core tasks with plan metadata', async () => {
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
  const byTask = Object.fromEntries(plan.units.map((u) => [u.task, u]));
  // canonChanged (basics, which the repo declares) → baselining (incremental) and,
  // since the repo has local packs, growth-dedup fire; extract does not (no projectChanged)
  assert.ok(byTask.baselining, 'baselining unit present');
  assert.equal(byTask.baselining.smarts, 'medium');
  assert.ok(byTask['growth-dedup-local-instructions'], 'dedup unit present');
  assert.ok(!byTask['growth-extract-new-instructions'], 'extract absent (project did not change)');
  for (const u of plan.units) assert.equal(u.repo, 'owner/foo');
});

test('buildWorkPlan: a member with no local packs gets baselining but not growth-dedup', async () => {
  const gh = fakeGh([
    [/o\/home\/commits\?since=/, { status: 200, json: [{ sha: 'c1' }] }],
    [/o\/home\/commits\/c1$/, { status: 200, json: { files: [{ filename: 'packs/basics/RULES.md' }] } }],
    [/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'grow_with_claudinite'] }) } }],
    [/\/local_packs$/, { status: 404, json: null }], // no local packs → nothing for dedup to prune
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
  ]);
  const plan = await buildWorkPlan(gh, 'o/home', [{ full_name: 'owner/foo', default_branch: 'main', pushed_at: '2000-01-01T00:00:00Z' }]);
  const tasks = plan.units.map((u) => u.task);
  assert.ok(tasks.includes('baselining'), 'baselining still fires on canonChanged');
  assert.ok(!tasks.includes('growth-dedup-local-instructions'), 'dedup skipped — no local packs');
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
  const curation = '.claudinite/local_packs/canon-curation';
  const rawB64 = (p) => Buffer.from(readFileSync(join(repoRoot, p), 'utf8'), 'utf8').toString('base64');
  const gh = fakeGh([
    // canonChanged false (no home commits in window)
    [/o\/home\/commits\?since=/, { status: 200, json: [] }],
    // home fullSweep may or may not be tonight (hash-staggered): give its probes empty answers either way
    [/o\/home\/commits\?sha=/, { status: 200, json: [] }],
    [/o\/home\/contents\/\.claudinite-checks\.json/, { status: 200, json: { content: b64({ packs: ['basics', 'local_packs/canon-curation'] }) } }],
    [/o\/home\/pulls\?/, { status: 200, json: [] }],
    [/o\/home\/issues\?/, { status: 200, json: [] }],
    [/o\/home\/branches\?/, { status: 200, json: [] }],
    [/o\/home\/contents\/\.claudinite\/local_packs$/, { status: 200, json: [{ name: 'canon-curation', type: 'dir', path: curation }] }],
    [/o\/home\/contents\/\.claudinite\/local_packs\/canon-curation\/run_daily$/, { status: 200, json: [
      { name: 'growth-promote-to-claudinite.mjs', type: 'file', path: `${curation}/run_daily/growth-promote-to-claudinite.mjs` },
      { name: 'prose-to-checks-sweep.mjs', type: 'file', path: `${curation}/run_daily/prose-to-checks-sweep.mjs` },
    ] }],
    [/growth-promote-to-claudinite\.mjs$/, { status: 200, json: { content: rawB64(`${curation}/run_daily/growth-promote-to-claudinite.mjs`) } }],
    [/prose-to-checks-sweep\.mjs$/, { status: 200, json: { content: rawB64(`${curation}/run_daily/prose-to-checks-sweep.mjs`) } }],
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
  assert.equal(promote.worker, '.claudinite/local_packs/canon-curation/promote.md');
  assert.equal(promote.workerRepo, 'o/home'); // the dispatch reads the worker from the home repo
  // whether tonight is home's full-sweep night or not, the one enrolled+changed member is the target set
  assert.deepEqual(promote.targets.repos, ['owner/foo']);
  // baselining self-skips the home repo (isHome), so home contributes no baselining unit
  assert.ok(!plan.units.some((u) => u.repo === 'o/home' && u.task === 'baselining'), 'no home baselining');
  // the member still planned normally (extract fires on projectChanged)
  assert.ok(plan.units.some((u) => u.repo === 'owner/foo' && u.task === 'growth-extract-new-instructions'));
});

test('buildWorkPlan: without a homeRepo the home is not planned (back-compat callers)', async () => {
  const gh = fakeGh([
    [/o\/home\/commits\?since=/, { status: 200, json: [] }],
  ]);
  const plan = await buildWorkPlan(gh, 'o/home', []);
  assert.deepEqual(plan.units, []);
  assert.deepEqual(plan.errors, []);
});

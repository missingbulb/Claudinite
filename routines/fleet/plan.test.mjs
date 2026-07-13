import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkPlan } from './plan.mjs';

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
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?/, { status: 200, json: [] }],
  ]);
  const coveredRepos = [{ full_name: 'owner/foo', default_branch: 'main', pushed_at: '2000-01-01T00:00:00Z' }];

  const plan = await buildWorkPlan(gh, 'o/home', coveredRepos);

  assert.equal(plan.canonChanged, true);
  assert.ok(typeof plan.generatedAt === 'string' && typeof plan.windowStartUtc === 'string');
  assert.equal(plan.errors.length, 0);
  const byTask = Object.fromEntries(plan.units.map((u) => [u.task, u]));
  // canonChanged → baselining (incremental) and growth-dedup fire; extract does not (no projectChanged)
  assert.ok(byTask.baselining, 'baselining unit present');
  assert.equal(byTask.baselining.smarts, 'medium');
  assert.ok(byTask['growth-dedup-local-instructions'], 'dedup unit present');
  assert.equal(byTask['growth-dedup-local-instructions'].order, 'growth:3');
  assert.ok(!byTask['growth-extract-new-instructions'], 'extract absent (project did not change)');
  for (const u of plan.units) assert.equal(u.repo, 'owner/foo');
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLocalTasks } from './local-tasks.mjs';
import { assembleForRepo, packTasks } from './registry.mjs';
import { buildWorkPlan } from './plan.mjs';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// A fake gh over the get_file_contents shapes: an array for a directory listing,
// a { content: base64 } object for a file, 404 otherwise.
function fakeGh(routes) {
  return async (path) => {
    for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
    return { status: 404, json: null };
  };
}

// A self-contained descriptor source, exactly the shape a local pack ships.
const EXTRACTOR_SRC = `export default {
  id: 'create-extractor',
  worker: 'run_daily/create-extractor/routine.md',
  order: null, full_sweep_supported: false, smarts: 'high',
  async gate(repo, signals, gh) {
    const full = repo.fullName ?? repo.full_name;
    const { status, json } = await gh('/repos/' + full + '/issues?labels=extractor-request&state=open');
    if (status !== 200 || !Array.isArray(json) || json.length === 0) return { run: false };
    return { run: true, targets: { issues: json.map((i) => i.number) }, reason: json.length + ' open' };
  },
};`;

test('readLocalTasks: fetches, imports, and tags a member local-pack descriptor', async () => {
  const gh = fakeGh([
    [/contents\/\.claudinite\/local_packs$/, { status: 200, json: [{ name: 'extractor-pipeline', type: 'dir', path: '.claudinite/local_packs/extractor-pipeline' }] }],
    [/contents\/\.claudinite\/local_packs\/extractor-pipeline\/run_daily$/, { status: 200, json: [
      { name: 'create-extractor.mjs', type: 'file', path: '.claudinite/local_packs/extractor-pipeline/run_daily/create-extractor.mjs' },
      { name: 'create-extractor', type: 'dir', path: '.claudinite/local_packs/extractor-pipeline/run_daily/create-extractor' }, // worker dir, ignored
    ] }],
    [/create-extractor\.mjs$/, { status: 200, json: { content: b64(EXTRACTOR_SRC) } }],
  ]);
  const tasks = await readLocalTasks(gh, 'owner/member');
  assert.equal(tasks.length, 1);
  const t = tasks[0];
  assert.equal(t.id, 'create-extractor');
  assert.equal(t.pack, 'extractor-pipeline');
  assert.equal(t.workerRepo, 'owner/member');
  // worker doc rewritten pack-relative -> member-repo-relative
  assert.equal(t.worker, '.claudinite/local_packs/extractor-pipeline/run_daily/create-extractor/routine.md');
  assert.equal(typeof t.gate, 'function');
});

test('readLocalTasks: no local_packs dir -> no tasks (not an error)', async () => {
  const tasks = await readLocalTasks(fakeGh([]), 'owner/member');
  assert.deepEqual(tasks, []);
});

test('readLocalTasks: a broken descriptor is skipped, the rest still load', async () => {
  const gh = fakeGh([
    [/local_packs$/, { status: 200, json: [{ name: 'proj', type: 'dir', path: '.claudinite/local_packs/proj' }] }],
    [/proj\/run_daily$/, { status: 200, json: [
      { name: 'good.mjs', type: 'file', path: '.claudinite/local_packs/proj/run_daily/good.mjs' },
      { name: 'bad.mjs', type: 'file', path: '.claudinite/local_packs/proj/run_daily/bad.mjs' },
    ] }],
    [/good\.mjs$/, { status: 200, json: { content: b64(`export default { id: 'good', worker: 'w.md', gate: async () => ({ run: false }) };`) } }],
    [/bad\.mjs$/, { status: 200, json: { content: b64('export default { not valid javascript(') } }],
  ]);
  const tasks = await readLocalTasks(gh, 'owner/member');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'good');
});

test('assembleForRepo: merges a member\'s local tasks, gated by its declaration', () => {
  const canon = packTasks([{ id: 'basics', run_daily: [{ id: 'baselining' }] }]);
  const local = [{ id: 'create-extractor', pack: 'extractor-pipeline', workerRepo: 'o/m' }];
  // both packs declared → both tasks
  assert.deepEqual(
    assembleForRepo(['basics', 'extractor-pipeline'], canon, local).map((t) => t.id).sort(),
    ['baselining', 'create-extractor'],
  );
  // local pack undeclared → its task drops out
  assert.deepEqual(assembleForRepo(['basics'], canon, local).map((t) => t.id), ['baselining']);
});

test('buildWorkPlan: runs a member local-pack task end to end via the localTasksFor seam', async () => {
  const gh = fakeGh([
    [/o\/home\/commits\?since=/, { status: 200, json: [] }], // canonChanged false — isolate the local task
    [/\.claudinite-checks\.json/, { status: 200, json: { content: b64(JSON.stringify({ packs: ['extractor-pipeline'] })) } }],
    [/\/pulls\?/, { status: 200, json: [] }],
    [/\/issues\?labels=extractor-request/, { status: 200, json: [{ number: 42 }, { number: 43 }] }],
    [/\/issues\?/, { status: 200, json: [] }],
  ]);
  const localTasksFor = async () => [{
    id: 'create-extractor', pack: 'extractor-pipeline', workerRepo: 'owner/member',
    worker: '.claudinite/local_packs/extractor-pipeline/run_daily/create-extractor/routine.md',
    order: null, full_sweep_supported: false, smarts: 'high',
    async gate(repo, signals, gh) {
      const { json } = await gh(`/repos/${repo.fullName}/issues?labels=extractor-request&state=open`);
      return json.length ? { run: true, targets: { issues: json.map((i) => i.number) }, reason: `${json.length} open` } : { run: false };
    },
  }];
  const plan = await buildWorkPlan(
    gh, 'o/home',
    [{ full_name: 'owner/member', default_branch: 'main', pushed_at: '2000-01-01T00:00:00Z' }],
    null,
    { localTasksFor },
  );
  const unit = plan.units.find((u) => u.task === 'create-extractor');
  assert.ok(unit, 'the local-pack task produced a unit');
  assert.equal(unit.repo, 'owner/member');
  assert.equal(unit.workerRepo, 'owner/member'); // dispatch reads the worker from the member
  assert.equal(unit.smarts, 'high');
  assert.deepEqual(unit.targets, { issues: [42, 43] });
});

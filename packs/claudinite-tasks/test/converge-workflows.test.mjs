import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  convergeSchedulerWorkflow, convergeWorkflows, secretNames, taskSecretNames,
  SCHEDULER_WORKFLOW, EXECUTOR_WORKFLOW,
} from '../converge-workflows.mjs';
import { hashedCron } from '../hash-minute.mjs';
import { VARS_BAG_ENV } from '../queue/vars-bag.mjs';
import { SUSPEND_ALL_VAR } from '../queue/suspend.mjs';

const mkRepo = () => mkdtempSync(join(tmpdir(), 'claudinite-workflows-'));
const CANON_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPO = 'missingbulb/GoogleCalendarEventCreator';
const STUB = "name: Claudinite scheduler\non:\n  schedule:\n    - cron: '10 * * * *'\n  workflow_dispatch:\n";

const SCHEDULER_STUB = "name: Claudinite scheduler\non:\n  schedule:\n    - cron: '10 * * * *'\n  workflow_dispatch:\n"
  + "jobs:\n  scheduler-run:\n    steps:\n      - name: Scheduler run\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: node scheduler-run.mjs\n"
  + "  drain:\n    steps:\n      - name: Drain\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: node executor.mjs\n";

const EXECUTOR_STUB_TEXT = "name: Claudinite executor\non:\n  issues:\n    types: [labeled]\n"
  + "jobs:\n  execute:\n    steps:\n      - env:\n          GITHUB_TOKEN: ${{ github.token }}\n          CLAUDINITE_SECRETS: ${{ toJSON(secrets) }}\n        run: node executor.mjs\n";


test('convergeSchedulerWorkflow: writes the stub with the repo-hashed cron, and is idempotent', () => {
  const root = mkRepo();
  assert.equal(convergeSchedulerWorkflow(root, REPO, STUB), true);
  const written = readFileSync(join(root, SCHEDULER_WORKFLOW), 'utf8');
  assert.match(written, new RegExp(`cron: '${hashedCron(REPO).replace(/[*]/g, '\\*')}'`));
  assert.ok(!written.includes("cron: '10 * * * *'"), 'the placeholder minute is replaced');
  // second run: already converged → no write
  assert.equal(convergeSchedulerWorkflow(root, REPO, STUB), false);
});


// The repo's own anchor hour picks BOTH cron hours (DESIGN §17). The rehearsal's
// `custom-anchor-hour` fixture proves such a member converges green; this proves the value that
// lands is its own — a converge that stamped the default instead would fire every task before its
// anchor and land it a day late, and nothing would go red.
test('convergeSchedulerWorkflow: both cron hours come from the repo\'s own dailyHour', () => {
  const root = mkdtempSync(join(tmpdir(), 'cw-hours-'));
  convergeSchedulerWorkflow(root, REPO, STUB, [], 9);
  const written = readFileSync(join(root, SCHEDULER_WORKFLOW), 'utf8');
  assert.match(written, /cron: '\d+ 9,21 \* \* \*'/, "the member's own anchor, and twelve hours after it");

  // Absent means the documented default, not a broken cron — an unset key is the default.
  const dflt = mkdtempSync(join(tmpdir(), 'cw-hours-'));
  convergeSchedulerWorkflow(dflt, REPO, STUB);
  assert.match(readFileSync(join(dflt, SCHEDULER_WORKFLOW), 'utf8'), /cron: '\d+ 4,16 \* \* \*'/);
});


// ── The canon's own copy against the stub it ships ──────────────────────────
// THE HOME IS THE LAST REPO TO RECEIVE ITS OWN STUB CHANGES: every member gets
// the stub written into `.github/workflows/` by its nightly converge, and the
// canon has no mount and no converge, so its copy is hand-maintained and drifts.
// That drift is invisible until it is a permission denial in production (#535:
// `actions: read` here against `write` in the stub, ten days of a stranded PR).
// A test that compares only the lines someone came for walks straight past it —
// so compare the STRUCTURE, whole.
test("the canon's own scheduler run workflow has not drifted from the stub it ships", () => {
  const stub = readFileSync(join(CANON_ROOT, 'packs/claudinite-tasks/stubs/claudinite-scheduler.yml'), 'utf8');
  const mine = readFileSync(join(CANON_ROOT, '.github/workflows/claudinite-scheduler.yml'), 'utf8');
  // The three documented differences, and no others: the canon runs its own
  // task modules at the repo root, carries its own resolved cron, and names its own
  // secrets where a member's converge would stamp them. The WHOLE cron expression is
  // repo-resolved now — the minute is hashed from the name and both hours come from the repo's
  // `taskScheduler.dailyHour` (DESIGN §17) — so structure-compare masks all of it, and the
  // assertion below pins the canon's own value to what the engine would compute.
  const structure = (text) => text
    .split('\n')
    .filter((l) => !l.trim().startsWith('#') && l.trim() !== '')
    .map((l) => l.replace('.claudinite/shared/packs/', 'packs/').replace(/cron: '[^']*'/, "cron: 'RESOLVED'"))
    .filter((l) => !/_TOKEN:/.test(l));
  assert.deepEqual(structure(mine), structure(stub));
});


// …and the value the mask hides. Masking the cron is what lets the structure compare survive two
// repos on different anchors, so without this the canon's own cron could say anything at all.
test("the canon's own cron is what the engine computes for it", () => {
  const mine = readFileSync(join(CANON_ROOT, '.github/workflows/claudinite-scheduler.yml'), 'utf8');
  const config = JSON.parse(readFileSync(join(CANON_ROOT, '.claudinite-settings.json'), 'utf8'));
  const expected = hashedCron('missingbulb/Claudinite', config.taskScheduler?.dailyHour);
  assert.match(mine, new RegExp(`cron: '${expected.replace(/[*]/g, '\\*')}'`),
    `the canon's workflow should carry cron '${expected}'`);
});


test("the canon's own executor workflow has not drifted from the stub it ships", () => {
  const stub = readFileSync(join(CANON_ROOT, 'packs/claudinite-tasks/stubs/claudinite-executor.yml'), 'utf8');
  const mine = readFileSync(join(CANON_ROOT, '.github/workflows/claudinite-executor.yml'), 'utf8');
  const structure = (text) => text
    .split('\n')
    .filter((l) => !l.trim().startsWith('#') && l.trim() !== '')
    .map((l) => l.replace('.claudinite/shared/packs/', 'packs/'))
    .filter((l) => !/_TOKEN:/.test(l));
  assert.deepEqual(structure(mine), structure(stub));
});

// A workflow is a pure function of its stub now. That is the point of #1301: while
// its content tracked the task set, every new secret needed a human-merged PR in
// every member, and a member that needed one to start its agent could never get it.
test('convergeWorkflows writes the executor workflow beside the cron one, verbatim from the stub', async () => {
  const root = mkRepo();
  writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({ packs: [] }));
  const { changed } = convergeWorkflows(root, REPO, { schedulerStub: SCHEDULER_STUB, executorStub: EXECUTOR_STUB_TEXT });
  assert.ok(changed.includes('.github/workflows/claudinite-executor.yml'));
  const written = readFileSync(join(root, '.github/workflows/claudinite-executor.yml'), 'utf8');
  assert.equal(written, EXECUTOR_STUB_TEXT);
  assert.ok(!written.includes('cron:'), 'the executor carries no cron — the scheduler run\'s drain is the poll');
  // Idempotent, like every other surface here.
  const again = convergeWorkflows(root, REPO, { schedulerStub: SCHEDULER_STUB, executorStub: EXECUTOR_STUB_TEXT });
  assert.equal(again.changed.filter((c) => c.endsWith('claudinite-executor.yml')).length, 0);
});


// The old mechanism regenerated the list from the declarations every converge, so a
// task set that changed rewrote the file. Nothing about a declaration may move it now.
test('a task set that changes leaves the executor workflow untouched', async () => {
  const root = mkRepo();
  writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({ packs: [] }));
  convergeWorkflows(root, REPO, { schedulerStub: SCHEDULER_STUB, executorStub: EXECUTOR_STUB_TEXT });
  writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({
    packs: [], taskScheduler: { endpoints: { default: { url: 'https://x', tokenSecret: 'CCR_TOKEN' } } },
  }));
  const again = convergeWorkflows(root, REPO, { schedulerStub: SCHEDULER_STUB, executorStub: EXECUTOR_STUB_TEXT });
  assert.equal(again.changed.filter((c) => c.endsWith('claudinite-executor.yml')).length, 0);
});


// The stubs and the code that reads what they stamp are two artifacts on two delivery
// lanes. Each stamp below is read by a module in this pack, so the stub is held to the
// constant that module reads rather than to a spelling of its own.
test('the vendored stubs stamp what the readers in this pack actually read', () => {
  const schedulerRun = readFileSync(join(CANON_ROOT, 'packs/claudinite-tasks/stubs/claudinite-scheduler.yml'), 'utf8');
  const executor = readFileSync(join(CANON_ROOT, 'packs/claudinite-tasks/stubs/claudinite-executor.yml'), 'utf8');
  // The declared secrets are stamped by the converge at the marker it looks for, and
  // only into the executor — the one workflow that runs task code.
  const root = mkRepo();
  writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify({ packs: [] }));
  convergeWorkflows(root, REPO, { schedulerStub: schedulerRun, executorStub: executor, secretNames: ['STORE_TOKEN'] });
  assert.match(readFileSync(join(root, EXECUTOR_WORKFLOW), 'utf8'), /STORE_TOKEN: \$\{\{ secrets\.STORE_TOKEN \}\}/);
  assert.doesNotMatch(readFileSync(join(root, SCHEDULER_WORKFLOW), 'utf8'), /secrets\.STORE_TOKEN/);
  // The variable bag the executor's task env unpacks (vars-bag.mjs), and the hold both
  // entry points gate on (suspend.mjs), under the names those readers import.
  assert.match(executor, new RegExp(`${VARS_BAG_ENV}: \\$\\{\\{ toJSON\\(vars\\) \\}\\}`));
  for (const text of [schedulerRun, executor]) {
    assert.match(text, new RegExp(`${SUSPEND_ALL_VAR}: \\$\\{\\{ vars\\.${SUSPEND_ALL_VAR} \\}\\}`));
  }
});

test('taskSecretNames is the tasks\' list alone; the stamp\'s adds the endpoint tokens', () => {
  const decls = [
    { code_work_required_secrets: ['B_KEY', 'A_KEY'] },
    { code_work_required_secrets: ['A_KEY'] },
    {},
  ];
  const config = { taskScheduler: { agenticTaskInvocationEndpoints: { default: { url: 'https://x.invalid', tokenSecret: 'CCR_ROUTINE_TOKEN' } } } };
  // What `executor-workflow-secrets` holds a member to: deduped, sorted, no config.
  assert.deepEqual(taskSecretNames(decls), ['A_KEY', 'B_KEY']);
  // What the converge stamps: that list plus the endpoint tokens the config names.
  assert.deepEqual(secretNames(decls, config), ['A_KEY', 'B_KEY', 'CCR_ROUTINE_TOKEN']);
});

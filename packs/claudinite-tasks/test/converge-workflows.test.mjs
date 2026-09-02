import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  convergeSchedulerWorkflow, convergeWorkflows,
  SCHEDULER_WORKFLOW, EXECUTOR_WORKFLOW,
} from '../converge-workflows.mjs';
import { hashedCron } from '../hash-minute.mjs';
import { SCHEDULER_BODIES, EXECUTOR_BODIES } from './workflow-bodies.mjs';

const mkRepo = () => mkdtempSync(join(tmpdir(), 'claudinite-workflows-'));
const CANON_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPO = 'missingbulb/GoogleCalendarEventCreator';
// The canon's own copy of each workflow is TWO files since #1599 — the shim in
// `.github/workflows/` and the body it calls — where a member still holds one. So
// reassemble the canon's equivalent single workflow before comparing: the shim's
// header (the triggers, ceiling and concurrency GitHub reads from nowhere else)
// followed by the callee's jobs.
const canonWorkflow = (half) => {
  const shim = readFileSync(join(CANON_ROOT, `.github/workflows/claudinite-${half}.yml`), 'utf8');
  const callee = readFileSync(join(CANON_ROOT, half === 'scheduler' ? SCHEDULER_BODIES[0] : EXECUTOR_BODIES[0]), 'utf8');
  return shim.slice(0, shim.indexOf('\njobs:') + 1) + callee.slice(callee.indexOf('\njobs:') + 1);
};

// Compare the STRUCTURE, whole — a test that compares only the lines someone came
// for walks straight past the drift it exists to catch (#535: `actions: read` here
// against `write` in the stub, ten days of a stranded PR).
const structure = (text) => text
  .split('\n')
  .filter((l) => !l.trim().startsWith('#') && l.trim() !== '')
  .map((l) => l.replace('.claudinite/shared/packs/', 'packs/').replace(/cron: '[^']*'/, "cron: 'RESOLVED'"))
  .filter((l) => !/_TOKEN:/.test(l));

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
  // The three documented differences, and no others: the canon runs its own
  // task modules at the repo root, carries its own resolved cron, and names its own
  // secrets where a member's converge would stamp them. The WHOLE cron expression is
  // repo-resolved now — the minute is hashed from the name and both hours come from the repo's
  // `taskScheduler.dailyHour` (DESIGN §17) — so structure-compare masks all of it, and the
  // assertion below pins the canon's own value to what the engine would compute.
  assert.deepEqual(structure(canonWorkflow('scheduler')), structure(stub));
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
  assert.deepEqual(structure(canonWorkflow('executor')), structure(stub));
});


// THE SHIM IS THE WHOLE POINT (#1599). Reassembling the canon's two halves above
// proves they still say what a member's single file says — but it would say the
// same of a canon that had quietly gone back to one fat workflow, since a stub
// pasted into `.github/workflows/` reassembles to itself. So pin the split: the
// file a converge cannot write holds no `run:` at all, and its one job is a call
// to the canon-hosted body with the caller's secrets forwarded.
test("the canon's own workflows are shims over canon-hosted bodies", () => {
  for (const [half, callee] of [['scheduler', SCHEDULER_BODIES[0]], ['executor', EXECUTOR_BODIES[0]]]) {
    const shim = readFileSync(join(CANON_ROOT, `.github/workflows/claudinite-${half}.yml`), 'utf8');
    assert.doesNotMatch(shim, /^\s*-?\s*run:/m, `the ${half} shim carries a step of its own`);
    assert.match(shim, new RegExp(`uses: missingbulb/Claudinite/${callee.replace(/[./]/g, '\\$&')}@`),
      `the ${half} shim does not call its canon-hosted body`);
    assert.match(shim, /^\s*secrets: inherit$/m, `the ${half} shim does not forward the caller's secrets`);
    assert.match(readFileSync(join(CANON_ROOT, callee), 'utf8'), /^\s*workflow_call:$/m,
      `${callee} is not callable`);
  }
});


// --- the README pack-badge row ---------------------------------------------
// Adoption seeds the row into a repo's README and nothing maintains it after, so
// a README is never rewritten by a run the repo didn't ask for it. Both halves
// matter: `--badges` writes a correct row, and a converge without it leaves the
// README untouched.

const CHECKS_PATH = '.claudinite-settings.json';

const ROW = [{ id: 'basics', path: 'packs/basics/badge.svg' }, { id: 'tidy-repo', path: 'packs/tidy-repo/badge.svg' }];


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


test('the vendored stubs are what the converge is written against', () => {
  const canon = join(dirname(fileURLToPath(import.meta.url)), '../../..');
  const schedulerRun = readFileSync(join(canon, 'packs/claudinite-tasks/stubs/claudinite-scheduler.yml'), 'utf8');
  const executor = readFileSync(join(canon, 'packs/claudinite-tasks/stubs/claudinite-executor.yml'), 'utf8');
  // The EXECUTOR is the only place secrets live (§14), and it names them one by one,
  // stamped by the converge at the `# claudinite:secrets` marker. Since the scheduler
  // run's drain became a dispatch rather than an executor run (§15.16), the scheduler
  // run runs no task code and gets nothing.
  assert.match(executor, /^\s*# claudinite:secrets\s*$/m, 'the marker the converge stamps at');
  assert.equal((schedulerRun.match(/\$\{\{ secrets\./g) ?? []).length, 0, 'the scheduler run holds no secret at all');
  assert.ok(!schedulerRun.includes('# claudinite:secrets'), 'and carries no marker to stamp one into');

  // NEITHER stub may serialise the whole secrets context (#1336). It is the shape
  // GitHub's malicious-workflow detection flags, and a flagged workflow parks every
  // run with zero jobs until a person approves it — which an unattended queue can
  // neither absorb nor notice. This is the guard on that never coming back by
  // accident; a member's copy is its own, but every member's copy starts here.
  for (const [name, text] of [['scheduler run', schedulerRun], ['executor', executor]]) {
    assert.ok(!/toJSON\(\s*secrets\s*\)/.test(text.replace(/^\s*#.*$/gm, '')),
      `${name}: toJSON(secrets) is the flagged pattern — name the secrets instead`);
  }
  // REPOSITORY VARIABLES TRAVEL AS ONE BAG (#1492), and only in the executor, which
  // is the only one of the two that runs task code. `vars` is the context GitHub's own
  // docs define as non-sensitive and render unmasked in logs, so serialising it is not
  // the exfiltration shape the guard above exists for — and the static-website pack has
  // fielded the same line since before that safeguard shipped.
  assert.match(executor, /CLAUDINITE_VARS: \$\{\{ toJSON\(vars\) \}\}/,
    'the executor carries the whole vars context as one static line');
  assert.doesNotMatch(schedulerRun, /toJSON\(vars\)/,
    'the scheduler run runs no task code, so it gets no bag');

  // The hold reaches every workflow, or it is not a hold (§15.24).
  for (const [name, text] of [['scheduler run', schedulerRun], ['executor', executor]]) {
    assert.match(text, /CLAUDINITE_TASKS_SUSPEND_ALL: \$\{\{ vars\.CLAUDINITE_TASKS_SUSPEND_ALL \}\}/,
      `${name}: the operator hold must be stamped into its env`);
  }
  // The run cap that used to bound a work step retired with the heartbeat
  // (§15.15): a run is bounded by ONE work step now, not by the leash.
  assert.doesNotMatch(schedulerRun, /timeout-minutes/, 'the scheduler-run job does no work to bound');
  assert.equal((schedulerRun.match(/^\s*- cron:/gm) ?? []).length, 1, 'the scheduler run is the repo\'s only cron');
  assert.equal((executor.match(/^\s*- cron:/gm) ?? []).length, 0, 'the executor has no schedule of its own');
});

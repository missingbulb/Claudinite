// Scheduling wiring: the two workflow files a repo running scheduled work carries, and
// the per-repo cron they are stamped with. Split from the engine's distribution wiring
// (engine/converge-wiring.mjs) because their subject is this pack's mechanism — a repo
// that declares no tasks pack carries neither file (#1317).
//
// SCAFFOLDED, NEVER CONVERGED. `.github/workflows/` is the one directory a member's
// nightly may not push to — the Action's own GITHUB_TOKEN is refused there — so these
// two files arrive once, at adoption (bootstrap when the pack is declared at init, the
// adopt-pack skill after), and the repo owns them from that moment. That is affordable
// because their content is static: secrets travel as one fixed line, the cron minute and
// anchor hours are written once here, and every `run:` names a mount path behind which
// the code converges nightly.
//
// Operates on a repo working tree at `root` with node:fs directly, returning a summary of
// what it wrote — idempotent: a repo already carrying both files produces an empty list.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashedCron } from './hash-minute.mjs';
import { DEFAULT_SCHEDULE } from './calendar.mjs';
import { loadConfig } from '../../engine/checks/helpers/repo-context.mjs';

export const SCHEDULER_WORKFLOW = '.github/workflows/claudinite-scheduler.yml';
// The queue's second workflow (tasks-dispatch DESIGN §14). The first one keeps the
// path above: `claudinite-scheduler.yml` holds the scheduler run and its drain, so the repo
// still has exactly one cron at one well-known path.
export const EXECUTOR_WORKFLOW = '.github/workflows/claudinite-executor.yml';
// `dailyHour` picks BOTH of the cron's hours (DESIGN §17): the anchor tick and the drain tick
// twelve hours after it. Optional, and absent means the documented default — an unset key is the
// default, never a misconfiguration — so a caller that does not read the repo's schedule still
// writes the right cron for every repo that has not moved its anchor.
export function schedulerWorkflowTarget(fullName, stubText, dailyHour = undefined) {
  return stubText
    .replace(/cron:\s*'[^']*'/, `cron: '${hashedCron(fullName, dailyHour ?? DEFAULT_SCHEDULE.dailyHour)}'`);
}

export function convergeSchedulerWorkflow(root, fullName, stubText, dailyHour = undefined) {
  return writeWorkflow(root, SCHEDULER_WORKFLOW,
    schedulerWorkflowTarget(fullName, stubText, dailyHour));
}

// The queue's second workflow — the label-event executor. No cron of its own (the
// scheduler run's drain is the poll) and nothing to stamp, so it is the stub verbatim.
export function convergeExecutorWorkflow(root, stubText) {
  return writeWorkflow(root, EXECUTOR_WORKFLOW, stubText);
}

function writeWorkflow(root, relPath, target) {
  const path = join(root, relPath);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === target) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, target);
  return true;
}

// Both files at once, from the stubs in the mount this pack was read out of. The
// scheduler run and the executor have to arrive together: the drain the first one
// starts dispatches the second, so a repo holding one without the other has a queue
// that fills and never empties.
export function convergeWorkflows(root, fullName, { schedulerStub, executorStub = null, dailyHour = undefined } = {}) {
  const changed = [];
  if (convergeSchedulerWorkflow(root, fullName, schedulerStub, dailyHour)) changed.push(SCHEDULER_WORKFLOW);
  if (executorStub && convergeExecutorWorkflow(root, executorStub)) changed.push(EXECUTOR_WORKFLOW);
  return { changed };
}

// Where this pack's stubs sit relative to a repo root: the mount for a member, the tree
// itself for the canon. The mount is probed first because a member has both shapes on
// disk only in the canon home, where the repo root is the right answer.
export function stubsDir(root) {
  const mounted = join(root, '.claudinite/shared/packs/claudinite-tasks/stubs');
  return existsSync(mounted) ? mounted : join(root, 'packs/claudinite-tasks/stubs');
}

// CLI: `node converge-workflows.mjs [owner/repo]` — scaffold THIS repo's two workflow
// files. The full name comes from argv or GITHUB_REPOSITORY/CLAUDINITE_REPO, and the
// cron it stamps from the repo's own `taskScheduler.dailyHour`.
async function main() {
  const argv = process.argv.slice(2);
  const fullName = argv.find((a) => !a.startsWith('--')) || process.env.GITHUB_REPOSITORY || process.env.CLAUDINITE_REPO;
  if (!fullName) { console.error('converge-workflows: need owner/repo (argv or GITHUB_REPOSITORY)'); process.exit(1); }
  const root = process.env.CLAUDINITE_REPO_ROOT || process.cwd();
  const stubs = stubsDir(root);
  const stubPath = join(stubs, 'claudinite-scheduler.yml');
  if (!existsSync(stubPath)) { console.error(`converge-workflows: vendored stub not found at ${stubPath}`); process.exit(1); }
  const executorPath = join(stubs, 'claudinite-executor.yml');
  const { changed } = convergeWorkflows(root, fullName, {
    schedulerStub: readFileSync(stubPath, 'utf8'),
    executorStub: existsSync(executorPath) ? readFileSync(executorPath, 'utf8') : null,
    dailyHour: loadConfig(root)?.taskScheduler?.dailyHour,
  });
  console.log(changed.length ? `converge-workflows: ${changed.join(', ')}` : 'converge-workflows: already converged');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

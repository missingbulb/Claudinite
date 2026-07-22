import { finding } from '../../engine/checks/helpers/findings.mjs';
import { workflowFiles } from '../../engine/checks/helpers/github-workflows.mjs';

// One schedule per repo. Which schedule depends on whether the repo has cut over to
// the per-repo scheduler (per-project-scheduling §3, §8):
//
// - **Cut over** (the vendored `claudinite-scheduler.yml` is present): that workflow
//   is the repo's ONE permitted cron. Every other recurring workflow must be
//   workflow_dispatch-only — a scheduler task dispatches it. Any other `schedule:` is
//   a competing cron and is flagged. This stricter rule travels WITH the scheduler
//   into a repo's mount — never before it, so a repo mid-cutover is never falsely
//   flagged for the crons it is about to retire.
// - **Not yet cut over** (no scheduler workflow): the fleet daily routine is still the
//   one schedule (routines/fleet/scheduling.md), so only a scheduled Claudinite
//   *executor* — a workflow that calls a canon reusable @main — is a competing
//   orchestrator. A consumer's own unrelated scheduled workflow is not flagged.
const SCHEDULER_WORKFLOW = '.github/workflows/claudinite-scheduler.yml';

const rule = {
  id: 'gha/no-scheduled-fleet-executor',
  severity: 'blocking',
  description: 'The vendored claudinite-scheduler.yml is the repo\'s only permitted cron once present; before cutover, a Claudinite executor (one that calls a canon reusable) must be workflow_dispatch-only',
  doc: 'routines/fleet/scheduling.md',
  why: 'a second cron competes with the one schedule the repo is meant to have — the per-repo scheduler after cutover, the fleet daily routine before it',

  run(ctx) {
    const out = [];
    const cutOver = ctx.read(SCHEDULER_WORKFLOW) !== null;
    for (const wf of workflowFiles(ctx)) {
      if (wf === SCHEDULER_WORKFLOW) continue; // the scheduler itself is the permitted cron
      const text = ctx.read(wf);
      if (text === null) continue;
      if (!/^\s*schedule:/m.test(text)) continue;
      if (cutOver) {
        // The scheduler is the repo's only cron; every other recurring workflow is
        // dispatch-only (a scheduler task fires it).
        out.push(finding(rule, {
          file: wf,
          what: 'carries a `schedule:` trigger, but the vendored claudinite-scheduler.yml is this repo\'s only permitted cron',
          fix: 'remove the schedule: trigger — make it workflow_dispatch only; a Claudinite scheduler task dispatches recurring workflows (per-project-scheduling §3)',
        }));
        continue;
      }
      // Pre-cutover: only a scheduled canon-reusable executor competes with the fleet routine.
      if (!/uses:\s*\S*\/Claudinite\/\.github\/workflows\//i.test(text)) continue;
      out.push(finding(rule, {
        file: wf,
        what: 'a Claudinite executor (it calls a canon reusable workflow) carries a `schedule:` trigger',
        fix: 'remove the schedule: trigger — make it workflow_dispatch only; the fleet daily routine is the only schedule (routines/fleet/scheduling.md)',
      }));
    }
    return out;
  },
};

export default rule;

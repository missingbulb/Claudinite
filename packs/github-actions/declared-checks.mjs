import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WORKFLOW_FILE } from '../../engine/checks/helpers/github-workflows.mjs';

// This pack's declared checks — pattern specs, not code. The spec vocabulary is
// documented in the helper's header; each declaration below reads as its own
// contract (what it scans, what it requires, what the failure says).
const SCHEDULER = '.github/workflows/claudinite-scheduler.yml';

export const scheduledFailureEscalation = patternRule({
  id: 'gha/scheduled-failure-escalation',
  severity: 'advisory',
  description: 'A scheduled workflow must escalate its own failure to a human-visible state',
  doc: 'skills/git-github-advanced/SKILL.md',
  why: 'nobody watches a scheduled run — a red run in the Actions list reaches no one',
  scanFiles: WORKFLOW_FILE,
  scanTracked: true,
  checkEachFile: [{
    whenFileMatches: /^\s*schedule:/m,
    require: /failure\(\)|report-failure/,
    what: 'runs on a schedule but has no visible failure escalation (no failure() job, no report-failure call)',
    fix: 'add a job that runs on failure() and opens a workflow-failure tracking issue a human will see (or use the shared report-failure action)',
  }],
});

export const labelCreateBeforeAdd = patternRule({
  id: 'gha/label-create-before-add',
  severity: 'advisory',
  description: 'A workflow applying a label should create it idempotently first',
  doc: 'skills/git-github-advanced/SKILL.md',
  why: '--add-label fails when the label does not exist yet — GitHub will not create it on demand',
  scanFiles: WORKFLOW_FILE,
  scanTracked: true,
  checkEachFile: [{
    whenFileMatches: /--add-label/,
    require: /label create/,
    what: 'uses --add-label with no idempotent `gh label create … || true` beforehand',
    fix: 'create the label idempotently before adding it, so the workflow survives its first run',
  }],
});

export const uniqueAutomationBranch = patternRule({
  id: 'gha/unique-automation-branch',
  severity: 'advisory',
  description: 'An automated job needs a per-run-unique branch name, not a date-keyed one',
  doc: 'skills/git-github-advanced/SKILL.md',
  why: 'a date-keyed branch collides with itself on a repeat run for the same key',
  scanFiles: WORKFLOW_FILE,
  scanTracked: true,
  matchLines: [{
    match: /checkout -b .*\$\(date/,
    unlessLineMatches: /\$RANDOM|github\.run_id|github\.run_number|\$\{\{\s*github\.sha/,
    what: 'creates a branch keyed only by the date',
    fix: 'append a per-run-unique suffix ($RANDOM, github.run_id) to the branch name',
  }],
});

export const pagesArtifactSymlinks = patternRule({
  id: 'gha/pages-artifact-symlinks',
  severity: 'blocking',
  description: 'A GitHub Pages artifact that uploads the repo root must prune the agent-tooling dirs (their skill symlinks dangle in CI)',
  doc: 'bootstrap.md',
  why: 'upload-pages-artifact tars with --dereference and fails on the dangling .claude/skills/* symlinks, blocking every deploy',
  relevantWhen: { trackedFileMatches: /^\.claude\/skills\//, noTrackedFileMatches: /^\.claudinite\/skills\// },
  scanFiles: WORKFLOW_FILE,
  scanTracked: true,
  checkEachFile: [{
    whenFileMatches: [/uses:\s*actions\/upload-pages-artifact/, /^\s*path:\s*['"]?\.\/?['"]?\s*$/m],
    require: /\brm\b[^\n]*\.claude/,
    what: 'uploads the repo root (path: .) to actions/upload-pages-artifact, but .claude/skills/* are symlinks into the gitignored .claudinite/ corpus (empty in CI) — they dangle and the action tars with --dereference, so the deploy fails',
    fix: 'add a step before the upload that prunes the agent tooling: `run: rm -rf .claude .claudinite` (never part of a published site)',
  }],
});

export const noScheduledFleetExecutor = patternRule({
  id: 'gha/no-scheduled-fleet-executor',
  severity: 'blocking',
  description: 'The vendored claudinite-scheduler.yml is the repo\'s only permitted cron once present — a competing cron\'s work moves into a scheduler task and the workflow goes; before it is vendored, a Claudinite executor (one that calls a canon reusable) must be workflow_dispatch-only',
  doc: 'packs/basics/scheduled-tasks.md',
  why: 'a second cron competes with the one schedule the repo is meant to have — the per-repo scheduler, which owns every recurring Claudinite job',
  scanFiles: WORKFLOW_FILE,
  scanTracked: true,
  excludeFiles: SCHEDULER,
  checkEachFile: [
    {
      relevantWhen: { pathExists: SCHEDULER },
      forbid: /^\s*schedule:/m,
      what: 'carries a `schedule:` trigger, but the vendored claudinite-scheduler.yml is this repo\'s only permitted cron',
      fix: 'port this workflow\'s steps into the scheduler task that owns the work and delete the workflow in the same commit — after cutover a task IS the recurring unit, so do not leave a dispatch-only workflow behind for a task to fire (per-project-scheduling §3)',
    },
    {
      relevantWhen: { pathAbsent: SCHEDULER },
      whenFileMatches: /uses:\s*\S*\/Claudinite\/\.github\/workflows\//i,
      forbid: /^\s*schedule:/m,
      what: 'a Claudinite executor (it calls a canon reusable workflow) carries a `schedule:` trigger',
      fix: 'remove the schedule: trigger — make it workflow_dispatch only, and adopt the vendored claudinite-scheduler.yml, which owns every recurring Claudinite job (packs/basics/scheduled-tasks.md)',
    },
  ],
});

export default [
  scheduledFailureEscalation,
  labelCreateBeforeAdd,
  uniqueAutomationBranch,
  pagesArtifactSymlinks,
  noScheduledFleetExecutor,
];

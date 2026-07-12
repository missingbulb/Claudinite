import branchCleanup from './run_daily/branch-cleanup.mjs';
import prAssess from './run_daily/pr-assess.mjs';
import issueTriage from './run_daily/issue-triage.mjs';
import tidyReport from './run_daily/tidy-report.mjs';

// The repo tidy-up, as a composable pack: the PR/branch/issue sweep the fleet routine
// runs, contributed the same way any pack contributes checks and skills. Declaring
// tidy-repo adds its run_daily tasks to that repo's plan; removing it is a durable
// opt-out (baselining never re-adds it — see the tidy-repo-seed migration).
//
// A declared pack (no detect fingerprint): --init seeds it into every new repo's
// declaration, and the one-time tidy-repo-seed migration seeds the existing fleet.
// It carries no conformance checks — its work is the run_daily tasks, not checks.
//
// The three dimension tasks (branch/PR/issue) plus the per-repo tidy-report
// reconciliation unit. Each dimension worker applies its single-object skill across the
// targets the plan hands it; tidy-report rewrites the standing tracker from their verdicts.
export default {
  id: 'tidy-repo',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [],
  run_daily: [branchCleanup, prAssess, issueTriage, tidyReport],
  // The single-object worker skills the dimension tasks apply, mounted wherever
  // tidy-repo is declared (skills/mount-skills.mjs).
  skills: ['single-branch-status', 'single-pr-status', 'single-issue-triage'],
};

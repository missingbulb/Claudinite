import branchCleanup from './maintenance/branch-cleanup.mjs';
import prAssess from './maintenance/pr-assess.mjs';
import issueTriage from './maintenance/issue-triage.mjs';

// The repo tidy-up, as a composable pack: the PR/branch/issue sweep the fleet routine
// runs, contributed the same way any pack contributes checks and skills. Declaring
// tidy-repo adds its maintenance tasks to that repo's plan; removing it is a durable
// opt-out (baselining never re-adds it — see the tidy-repo-seed migration).
//
// A declared pack (no detect fingerprint): --init seeds it into every new repo's
// declaration, and the one-time tidy-repo-seed migration seeds the existing fleet.
// It carries no conformance checks — its work is the maintenance tasks, not checks.
//
// Stage 1 (here): the three dimension tasks, each pointing at a whole-repo worker doc.
// Stage 2 will add the per-repo tidy-report reconciliation unit and swap the workers
// for single-object skills (single-branch-status / single-pr-status / single-issue-triage).
export default {
  id: 'tidy-repo',
  detect: null,
  marker: null,
  prose: 'RULES.md',
  rules: [],
  maintenance: [branchCleanup, prAssess, issueTriage],
};

// The repo tidy-up, as a composable pack: the PR/branch/issue sweep the repo's own
// scheduler runs, contributed the same way any pack contributes checks and skills.
// Declaring tidy-repo puts its scheduled task on that repo's schedule; removing it
// is a durable opt-out (baselining never re-adds it — see the tidy-repo-seed
// migration).
//
// A declared pack (no detect fingerprint): --init seeds it into every new repo's
// declaration, and the one-time tidy-repo-seed migration seeds the existing fleet.
// It carries no conformance checks — its work is the scheduled task, not checks.
//
// One task, repo-tidy: its worker assesses branches and PRs read-only, acts on issues,
// then reconciles the standing tracker — each per-object step delegated to a single-
// object skill. It replaced the four separate dimension/report tasks (and their
// per-repo ordering barrier) once the skills owned the actual per-object method.
export default {
  id: 'tidy-repo',
  detect: null,
  marker: null,
  seededByDefault: true,
  prose: 'RULES.md',
  rules: [],
  // The pack's one scheduled task — repo-tidy — lives in this pack's
  // `tasks/repo-tidy/`, discovered by the scheduler's filesystem scan
  // (engine/scheduler/discover.mjs), not declared here.
  //
  // The single-object worker skills the repo-tidy worker applies live under this
  // pack's own skills/ and mount wherever
  // tidy-repo is declared.
};

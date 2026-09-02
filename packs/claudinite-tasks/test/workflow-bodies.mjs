// WHERE THE SCHEDULER AND EXECUTOR ACTUALLY LIVE, for the tests that assert on
// their content. Since #1599 the canon's own `.github/workflows/` holds one-job
// shims and the jobs themselves sit in the `-callee.yml` reusable workflows
// beside them, so a test reading `claudinite-scheduler.yml` for a `run:` line, a
// job output or a label trigger would find a shim and pass vacuously.
//
// Two surfaces, because a rule that watches one of two structurally-identical
// vendored surfaces is half a rule (#1138): the canon's own live body, and the
// stub every member is vendored — which is still the pre-shim shape, so a member
// keeps a whole workflow where the canon keeps a shim plus a callee.
export const SCHEDULER_BODIES = [
  '.github/workflows/claudinite-scheduler-callee.yml',
  'packs/claudinite-tasks/stubs/claudinite-scheduler.yml',
];

export const EXECUTOR_BODIES = [
  '.github/workflows/claudinite-executor-callee.yml',
  'packs/claudinite-tasks/stubs/claudinite-executor.yml',
];

// The shims themselves: what a member's `.github/workflows/` is allowed to hold.
export const CANON_SHIMS = [
  '.github/workflows/claudinite-scheduler.yml',
  '.github/workflows/claudinite-executor.yml',
];

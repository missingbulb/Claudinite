import schedulerWorkflowShape from './scheduler-workflow-shape.mjs';
import taskDeclarationShape from './task-declaration-shape.mjs';

// The per-project scheduling mechanism (per-project-scheduling DESIGN, issue
// #394): a repo schedules ITSELF via a vendored hourly scheduler Action that
// evaluates each task's precondition and dispatches agent work as
// `ready-for-agent` issues, which a per-repo executor routine runs. This pack
// owns the conformance guards for that mechanism — the shape of the vendored
// `claudinite-scheduler.yml` and the shape of every `tasks/<name>/task.mjs`
// declaration. The engine that runs it is vendored under
// `.claudinite/shared/engine/scheduler/`; these checks guard the surfaces a
// repo authors around it.
//
// Activation is by declaration like every pack. The pack is relevant to any repo
// that runs the scheduler or authors tasks, so `detect` seeds it at adoption
// wherever either artifact is present (the canon, which authors the pack tasks,
// declares it directly). Both rules are relevance-first — inert until their
// artifact exists — so declaring the pack on a repo with neither is a no-op.
const TASK_MJS = /(^|\/)tasks\/[^/]+\/task\.mjs$/;
const SCHEDULER_WORKFLOW = '.github/workflows/claudinite-scheduler.yml';

export default {
  id: 'scheduled-tasks',
  marker: SCHEDULER_WORKFLOW,
  // Relevant where the repo runs the scheduler OR authors task declarations in
  // its own tree (packs/ or local packs — the vendored shared mount is out of
  // the scanned set, so a pure consumer keys off the workflow file).
  detect: (ctx) => ctx.tracked.includes(SCHEDULER_WORKFLOW) || ctx.tracked.some((f) => TASK_MJS.test(f)),
  prose: 'RULES.md',
  rules: [
    schedulerWorkflowShape,
    taskDeclarationShape,
  ],
};

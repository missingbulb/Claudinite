// product-wiki task: wiki-growth — one research-and-refine pass over the repo's
// product wikis (per-project-scheduling DESIGN §6). Worker: task.md.
//
// WEEKLY, not daily and not commit-gated: research arrives on the world's clock,
// not the repo's, and a nightly high-model pass economically pressures
// fabrication (the Karpathy LLM-wiki cadence). The `commits` signal is declared
// only so the precondition can note recent product-relevant movement in context;
// the run itself is scheduled by frequency, not triggered by a commit.
//
// The open-growth-PR preflight stays in task.md, and is NOT subsumed by the
// scheduler: planDispatch guards at most one open dispatch ISSUE per (pack,
// task) — it never looks at pull requests. A completed run converges and closes
// its own dispatch issue while leaving the growth PR open for review, so the
// next weekly slot finds no open issue in the family and dispatches freely. The
// preflight is the only thing standing between an unreviewed PR and a second
// round of research stacked on top of it; do not delete it on the strength of
// the issue guard.
//
// The precondition itself deliberately never declines: a wiki grows on research
// availability, not repo activity, so there is no cheaper gate to apply than the
// weekly slot, and the worker's own stop condition (no citable material → no
// branch, no PR) is the real "nothing to do" outcome.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'wiki-growth',
  frequency: 'weekly',             // fires at the weekly anchor (DESIGN §2) — the world's clock, not the repo's
  precondition_signals: ['commits'],
  agent_model: 'opus',                   // open-web research + curation is the heaviest judgment, and the PR review gate is the last catch for fabrication
  expected_outcome: 'open-pr',              // web-researched claims entering a knowledge base need the human review gate — never merged, never pushed to default
  agent_instructions: 'task.md',
  agent_execution_timeout: 2700,            // open-web research is the least predictable of the tasks — very generous

  // The weekly slot IS the trigger — there is no cheaper gate to apply, because a
  // wiki grows on research availability, not repo activity. Always run when due;
  // the worker's own stop condition (no citable material → no branch, no PR) is
  // the real "nothing to do" outcome, and task.md's open-growth-PR preflight —
  // not the scheduler, which guards issues only — prevents stacking a second
  // round on an unreviewed PR.
  precondition(signals) {
    const touched = signals.commits?.touchedPaths ?? [];
    const wikiMoved = touched.some((p) => p.startsWith('product-wiki/'));
    const context = wikiMoved
      ? ['The product-wiki tree moved in the window — spot-check any pages whose cited claims the change may have superseded.']
      : [];
    return { run: true, reason: 'weekly product-wiki growth pass', context };
  },
};

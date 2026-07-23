// product-wiki task: wiki-growth — one research-and-refine pass over the repo's
// product wikis (per-project-scheduling DESIGN §6). Worker: task.md.
//
// WEEKLY, not daily and not commit-gated: research arrives on the world's clock,
// not the repo's, and a nightly high-model pass economically pressures
// fabrication (the Karpathy LLM-wiki cadence). The `commits` signal is declared
// only so the precondition can note recent product-relevant movement in context;
// the run itself is scheduled by frequency, not triggered by a commit. The old
// open-growth-PR preflight is subsumed by the scheduler's at-most-one-open-issue
// guard, so the precondition simply lets the weekly slot through.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'wiki-growth',
  frequency: 'weekly',             // fires at the weekly anchor (DESIGN §2) — the world's clock, not the repo's
  precondition_signals: ['commits'],
  agent_model: 'opus',                   // open-web research + curation is the heaviest judgment, and the PR review gate is the last catch for fabrication
  expected_outcome: 'open-pr',              // web-researched claims entering a knowledge base need the human review gate — never merged, never pushed to default
  agent_instructions: 'task.md',

  // The weekly slot IS the trigger — there is no cheaper gate to apply, because a
  // wiki grows on research availability, not repo activity. Always run when due;
  // the worker's own stop condition (no citable material → no branch, no PR) is
  // the real "nothing to do" outcome, and the scheduler's one-open-dispatch-issue
  // guard prevents stacking a second round on an unreviewed PR.
  precondition(signals) {
    const touched = signals.commits?.touchedPaths ?? [];
    const wikiMoved = touched.some((p) => p.startsWith('product-wiki/'));
    const context = wikiMoved
      ? ['The product-wiki tree moved in the window — spot-check any pages whose cited claims the change may have superseded.']
      : [];
    return { run: true, reason: 'weekly product-wiki growth pass', context };
  },
};

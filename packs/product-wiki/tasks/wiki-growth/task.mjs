// product-wiki task: wiki-growth — one research-and-refine pass over the repo's
// product wikis (per-project-scheduling DESIGN §6). Worker: task.md.
//
// WEEKLY, not daily and not commit-gated: research arrives on the world's clock,
// not the repo's, and a nightly high-model pass economically pressures
// fabrication (the Karpathy LLM-wiki cadence). The `commits` signal is declared
// only so the precondition can note recent product-relevant movement in context;
// the run itself is scheduled by frequency, not triggered by a commit.
//
// The open-growth-PR gate lives HERE, in the precondition (DESIGN §12: the
// precondition is the ONLY decision point — it used to be a task.md preflight,
// which was the agentic phase deciding to skip a run its precondition had
// already granted). It is not subsumed by the queue: the queue guards at most one
// live ITEM per task — it never looks at pull requests, and a completed run closes
// its item while leaving the growth PR open for review. This gate is the only thing standing between an unreviewed
// PR and a second round of research stacked on top of it.
//
// Self-contained (imports nothing): the whole contract is this default export.

// The label the worker puts on every growth PR — the family marker this
// precondition declines on. task.md names the same string; keep them in step.
const GROWTH_LABEL = 'product-wiki-growth';

export default {
  id: 'wiki-growth',
  frequency: 'weekly',             // fires at the weekly anchor (DESIGN §2) — the world's clock, not the repo's
  precondition_signals: ['commits', 'prs'],
  agent_model: 'opus',                   // open-web research + curation is the heaviest judgment in the task set
  expected_outcome: 'merged-pr',
  agent_instructions: 'task.md',
  agent_execution_timeout: 2700,            // open-web research is the least predictable of the tasks — very generous

  // The weekly anchor is the trigger — a wiki grows on research availability, not
  // repo activity — EXCEPT while a previous round's growth PR sits unreviewed:
  // then this run is declined here, in code, rather than granted and abandoned
  // by the agent. The worker's own stop condition (no citable material → no
  // branch, no PR) remains the legal empty OUTCOME of a run that did happen.
  precondition(signals) {
    const openGrowthPr = (signals.prs?.open ?? [])
      .find((p) => (p.labels ?? []).includes(GROWTH_LABEL));
    if (openGrowthPr) {
      return {
        run: false,
        reason: `growth PR #${openGrowthPr.number} is still open (label ${GROWTH_LABEL}) — research waits for its review, so a second unreviewed round is never stacked on it`,
      };
    }
    const touched = signals.commits?.touchedPaths ?? [];
    const wikiMoved = touched.some((p) => p.startsWith('product-wiki/'));
    const context = wikiMoved
      ? ['The product-wiki tree moved in the window — spot-check any pages whose cited claims the change may have superseded.']
      : [];
    return { run: true, reason: 'weekly product-wiki growth pass', context };
  },
};

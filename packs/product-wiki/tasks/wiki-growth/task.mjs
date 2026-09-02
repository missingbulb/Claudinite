// product-wiki task: wiki-growth — one research-and-refine pass over the repo's
// product wikis (per-project-scheduling DESIGN §6). Worker: task.md.
//
// WEEKLY, not daily and not commit-gated: research arrives on the world's clock,
// not the repo's, and a nightly high-model pass economically pressures
// fabrication (the Karpathy LLM-wiki cadence). The `commits` signal is declared
// only so the precondition can note recent product-relevant movement in context;
// the run itself is scheduled by frequency, not triggered by a commit.
//
// The pending-wiki-change gate lives HERE, in the precondition (DESIGN §12: the
// precondition is the ONLY decision point — it used to be a task.md preflight,
// which was the agentic phase deciding to skip a run its precondition had
// already granted). It is not subsumed by the queue: the queue guards at most one
// live ITEM per task — it never looks at pull requests, and a completed run closes
// its item while leaving the growth PR open for review. This gate is the only thing standing between an unreviewed
// PR and a second round of research stacked on top of it.
//
// Self-contained (imports nothing): the whole contract is this default export.

// The wiki tree, root-anchored: the prefix this precondition both declines on
// (a pending change to it) and adds context for (a landed change to it), and the
// scope of what the round's own PR may land unreviewed.
const WIKI_ROOT = 'product-wiki/';

export default {
  id: 'wiki-growth',
  frequency: 'weekly',             // fires at the weekly anchor (DESIGN §2) — the world's clock, not the repo's
  // Research about the world, but worth nothing on a repo nobody works in — and
  // never a second unreviewed round stacked on a wiki change already in flight.
  preconditions: ['repo-active', 'no-open-pr-touching:product-wiki/'],
  agent_model: 'opus',                   // open-web research + curation is the heaviest judgment in the task set
  expected_outcome: 'pr',
  // Markdown, and only inside the tree the round is allowed to grow: `&&` is the
  // intersection, so a doc elsewhere in the repo and a non-doc file inside the
  // wiki both park the round for review. On a member whose mount predates this
  // vocabulary the policy reads as invalid, which is the same park — never a
  // wider merge.
  automerge: [`under:${WIKI_ROOT} && doc-changes`],
  agent_instructions: 'task.md',
  agent_execution_timeout: 2700,            // open-web research is the least predictable of the tasks — very generous
};

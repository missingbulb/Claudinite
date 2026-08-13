import { NEEDS_HUMAN } from './engine-update.mjs';

// THE UNIFORM TERMINAL (docs/versioned-updates/DESIGN.md §3.9, §5). What happens to
// an update's PR, given what the flow returned — one function for every flow, so
// "how does an update end" has a single answer no shell can re-decide.
//
// The rule the design is emphatic about: **every non-green end looks the same**.
// An unanswered interview, an agentic repair that left checks red, a migration that
// could not complete, a pack whose engine is too old — none of them is a special
// case with its own handling. The PR stays open, the dispatch issue is labelled,
// the run stops. Interviews were one instance of that rule, never the rule.
//
// PRECEDENCE, most-specific first, and the order is the point:
//
//   1. `needs-human` — a terminal the flow already reached. Nothing downstream may
//      override it, including a repo that would otherwise auto-merge.
//   2. `apply-stage` — the pack flow's agentic tail is needed. It is NOT a merge:
//      the rules have landed but nothing has yet reconciled them with the member's
//      own content, and merging first would call that reconciliation optional.
//   3. whatever the flow's own delivery decision said — merge, or keep for review.
//
// Returning `{ action, label, why }` rather than a bare verb because the shell has
// to be able to say, in the PR and in the log, why the run ended where it did. A
// terminal nobody can explain is one nobody will trust the next time it fires.
export const TERMINALS = ['merge', 'keep', 'apply-stage', 'needs-human'];

export function terminalFor(outcome) {
  if (!outcome || typeof outcome !== 'object') {
    return { action: 'needs-human', label: NEEDS_HUMAN, why: 'the update flow returned nothing to act on' };
  }
  if (outcome.status === NEEDS_HUMAN) {
    return { action: 'needs-human', label: NEEDS_HUMAN, why: outcome.detail ?? 'the flow ended at a human terminal' };
  }
  if (outcome.applyStage?.needed) {
    return {
      action: 'apply-stage',
      packs: outcome.applyStage.packs ?? [],
      withheld: outcome.applyStage.withheld ?? [],
      why: outcome.applyStage.why ?? 'the pack\'s new rules must be applied to content the canon has never seen',
    };
  }
  const decided = outcome.decision?.action;
  if (decided === 'merge') return { action: 'merge', forced: Boolean(outcome.decision?.forced), why: outcome.decision.why };
  if (decided === 'keep') return { action: 'keep', why: outcome.decision.why };
  // A flow that reported success but decided nothing has not been judged at all —
  // and an unjudged update is exactly what must never merge itself.
  return { action: 'needs-human', label: NEEDS_HUMAN, why: 'the flow reported success but reached no delivery decision' };
}

// THERE IS NO RENDERED BRIEF HERE ANY MORE, and its absence is the design.
//
// This module used to export `applyStageBrief`, which composed a full set of
// instructions for the apply-stage session and which the worker wrote into the
// request payload. Nothing ever read it — that is the only reason two problems with
// it stayed invisible.
//
// It restated `packs/basics/tasks/update/task.md` §2–5 from a second home that could
// drift from the first, with no test able to notice. And it was the natural place to
// put a withheld workflow's CONTENT, which is exactly where content must not go: the
// scheduler's rule for the code→agent boundary (engine/scheduler/prework.mjs) is that
// a request payload carries identifiers and the NAME of the condition that fired,
// "never findings and never instructions — everything else travels through the
// repository." Content routed through a payload leaves the PR's diff, and a workflow
// nobody can see in a diff is a workflow nobody reviewed.
//
// So the apply stage is told three things, each from where it belongs: WHY, as
// `reason.detail` from the terminal below; WHAT TO DO, from task.md, which the
// dispatch issue's first line links; and WHAT TO DO IT TO, from the branch — the
// staged workflow files and the migration record named in the reason, both of which
// the session reads out of the repository like any other fact about it.

// …EXCEPT THAT IT CANNOT SIMPLY BE DELETED, and this shim is the reason the fleet
// still runs. THE ASYMMETRY THAT BITES HERE: a member's vendored WORKER is one cycle
// behind, but the flows it loads come from a FRESH CANON CLONE — so canon-side code
// is instantly current while the code CALLING it is instantly stale. Deleting an
// export from this module does not deprecate it; it breaks every worker already in
// the field, on its very next run.
//
// Every member in the fleet carries a worker doing:
//
//     const { terminalFor, applyStageBrief } = await load('updates/terminals.mjs');
//     ...  brief: applyStageBrief({ packs: terminal.packs, branch }),
//
// on its `apply-stage` path — the path #797 now sends EVERY member down, because
// every member's scheduler workflow is stale. Without this export that line throws
// `applyStageBrief is not a function` after the PR is opened but before the run ends:
// the update never completes, the mount never refreshes, so the member never receives
// the worker that would stop calling it. A permanent wedge, fleet-wide, on the first
// cycle.
//
// The canary rehearsal cannot see this: it deliberately runs the worker THIS REF
// SHIPS against the canary's tree, so it exercises the new caller and never the old
// one. The gate is right to do that — a change to the worker cannot be rehearsed by
// the copy that predates it — but it means removing a flow-side export is a class of
// break no rehearsal covers.
//
// So it stays until no worker in the fleet calls it: one full cycle after the members
// vendor a worker that does not. It returns a string nothing reads (the payload key
// it fed is no longer consumed), and it exists to be CALLABLE, not to be useful.
export function applyStageBrief({ packs = [], branch = null } = {}) {
  return `Apply the updated rules of: ${packs.join(', ') || '(none named)'}`
    + `${branch ? ` on ${branch}` : ''}. See this task's task.md for what that means.`;
}

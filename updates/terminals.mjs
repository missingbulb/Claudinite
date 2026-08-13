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

// The agentic apply stage's own instructions, for the shell that dispatches it.
// Stated here rather than in the shell because it is policy, not plumbing: what the
// session is allowed to do, and where it must stop.
//
// It also inherits the ORPHANED executor-routine verification (DESIGN §3.8). The CCR
// routine that fires on the ready label is not a GitHub artifact — no Action can see
// whether it exists or is wired correctly — so only a session can, and this is the
// only agent lane left once the engine flow has none.
export function applyStageBrief({ packs = [], branch = null } = {}) {
  return [
    `Apply the updated rules of: ${packs.join(', ') || '(none named)'}.`,
    '',
    'Scope is this update\'s branch' + (branch ? ` (\`${branch}\`)` : '') + ' — fix the repo against the new rules and',
    'repair the tests they break. Nothing outside that scope, and no new features.',
    '',
    'Also verify this repo\'s executor routine: it fires on the ready label and no Action can',
    'see it, so a session is the only thing that can confirm it exists and points at the',
    'mounted executor instructions.',
    '',
    'End green or end at `needs-human`. A repair you are unsure of is a `needs-human`,',
    'not a merge — every non-green end looks the same, and that is the point.',
  ].join('\n');
}

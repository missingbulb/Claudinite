# ci-performance

## Why the declaration reads as it does

Carried over from the declaration's comments when it became `task.json`.

basics task: ci-performance — the weekly read on where this repo's CI time goes,
and whether it has got worse.

A suite's runtime degrades the way a lawn grows: never in one visible step, so
nobody profiles it until it is bad enough to complain about, by which point the
cause is a dozen changes back. This task takes the measurement on a cadence
instead, from the one ledger that cannot be argued with — the Actions run
history — and keeps a standing record of it.

CONDITIONAL HANDOFF. Code-work does the measuring, which is pure code: read the
runs, take each workflow's median over this window and the one before, compare.
A quiet week ends there — the record is refreshed and no agent is spent. Only a
real regression requests the agent, which then has something worth its time: a
named workflow, a before and after, and the ci-performance-evaluation skill's
method for finding the cause.

WHY sonnet: the finding arrives already localized to a workflow and a delta, and
the skill states the method step by step; what remains is profiling and a bounded
fix. What it may land unattended is the `automerge` policy below.

Movement, not standing state: CI runtime only changes when something lands, so
a week where nothing moved has the same runs, the same medians and the same
verdict as last week.

`fresh_pr`, and a week whose fix is still open does not run at all
(`no-open-pr-of-this-task`): a performance fix is argued from an A/B this run
measured, so a second round cannot be folded into the first one's review, and
an earlier round left standing is the reviewer's context for this one. The term
reads the task's own branch family rather than a title or a path, which is what
a fix landing anywhere in the repo can offer.
A couple of hundred run records plus one job breakdown, against this repo's own
API. Seconds in practice; the bound is for a rate-limited or wedged read.
Profiling a suite means running it, more than once, in both arms of an A/B.

# tidy-repo — the repo tidy-up policy

The PR/issue sweep, active wherever this pack is declared. The repo's own queue runs the pack's two
maintenance tasks — `tidy-issues`, `tidy-prs`, one per dimension; this is the policy they follow. The
per-object **method** lives in the pack's skills ([single-pr-status](skills/single-pr-status/SKILL.md),
[single-issue-triage](skills/single-issue-triage/SKILL.md)).

The one rule that shapes everything: **assess PRs read-only; act only on issues.**

- **PRs — assess only.** Report which should stay open and which are safe to close; **never** merge or
  close them. Judge by *content* (the landed-status test), never a ref's auto-generated name.
- **Issues — act.** Take the first applicable action: close-if-implemented / needs-decision / blocked
  / quick-win / leave. "Implemented in `main`" means the issue's actual ask is true of `main`'s
  content **now** — confirm it there and cite it; when you can't, comment, don't close. Every action
  defaults to the reversible option (comment / leave) when the check is inconclusive. A verdict
  identical to the one already posted on that issue is **not** an action — say nothing, or the
  comment becomes tomorrow's trigger.
- **Trackers — record changes, never scans.** A run reaches its tracker only with something to record:
  an action actually taken (issues), or a picture that differs from what the body already says (PRs).
  A run that acted on nothing, or re-derived the same verdicts, leaves the tracker untouched and
  creates none.

Each task applies its single-object skill across the targets its precondition hands it, then rewrites
**its own** standing tracker from the verdicts it gathered (one issue per dimension per repo, body
rewritten to today's state, a dated comment beside it). One tracker per task, never a shared one: the
two tasks are independent and may run at once, so nothing races to rewrite one body.

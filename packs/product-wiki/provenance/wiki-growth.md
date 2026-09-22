## 2026-07-17 · born · Add product-wiki pack: the self-growing product research wiki standard (#301)
- **Source:** the standard missingbulb/GoogleCalendarEventCreator had just adopted (its #678) - the
  LLM-wiki pattern Karpathy described: compile findings once, refine in place, cite everything, keep
  a dated growth log.
- **Reason:** growth is scheduled research - read the wikis end to end, research only what their own
  open questions flag, write back cited, one dated log entry per touched page, and stay silent on a
  clean no-op. Most passes correctly change nothing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a weekly fleet routine with a worker doc carrying the method, gated on the
  full-sweep day because research arrives on the world's clock rather than the repo's.
- **Landed:** #301 (Refs #302) · pack version 1.

## 2026-07-22 · moved · Per-project scheduling - Phase 0: engine/scheduler, groundwork, checks, task conversions (#396)
- **Reason:** maintenance moves from one central fleet routine to each repo's own scheduler, so the
  pass becomes a task the repo discovers and runs for itself. The conversion landed additively
  beside the legacy routine, which was deleted only once the new task doc had been read against it
  clause by clause.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a task under tasks/wiki-growth/, discovered structurally by the repo's scheduler.
- **Landed:** #396 (Refs #394) · pack version 1.

## 2026-07-27 · reworded · Wire the three signal-context keys nothing populated (#479)
- **Reason:** the task doc named the declaration field `model:` where the field is `agent_model:`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #479 (Refs #394) · pack version 1.

## 2026-07-27 · reworded · Baselining audit: six independent fixes to the run_daily to tasks ports (#494)
- **Reason:** the doc called an open growth pull request an anomaly the dispatch guard covers. That
  guard filters dispatch issues and never looks at pull requests, so finding one open is the
  ordinary case and the preflight is load-bearing - a false reassurance hands a later reader a
  licence to delete the one guard that covers this, with nothing failing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #494 · pack version 1.

## 2026-07-29 · reworded · product-wiki: every wiki page opens with a Key insights header (#542)
- **Reason:** the pass gains a reconcile step - a run that changes a page's top-line understanding
  rewrites the header, a run that does not leaves it alone - with leaving a header asserting what
  the body it heads no longer says as a must-never.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #542 (Closes #543) · pack version 1.

## 2026-08-06 · reworded · scheduler: hand the agent its artifacts by identity, not by name (#657)
- **Reason:** an agent must never locate its working artifacts by a branch or pull request name - a
  search that finds nothing is indistinguishable from nothing having been created, and the agent
  believes it. This task has no preprocessing, so a previous round's pull request is found by the
  label it deliberately applies, and its branch name is now explicitly meaningless.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #657 (Refs #649) · pack version 1.

## 2026-08-10 · policy-changed · product-wiki: raise wiki-growth's ceiling to merged-pr, and stop restating it (#732)
- **Reason:** the ceiling was deciding delivery, which is the member's call - the same task should
  land itself on one repo and wait on another, and the standing backlog showed rounds stacking on
  unmerged ones. The one-word flip exposed that the ceiling was written down five times, so changing
  one setting meant editing five places that could disagree.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the outcome ceiling rises to a merged pull request and lives only in the
  declaration; the task doc points at the delivery procedure rather than restating what that
  procedure decides.
- **Landed:** #732 (Closes #733) · pack version 1.

## 2026-08-23 · policy-changed · Gate wiki-growth on pending product-wiki paths, not a label (#1257)
- **Reason:** the growth label had exactly one reader, this precondition, so every growth pull
  request carried a marker nothing else looked at and one opened without it was silently stacked on
  by the next week's run.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the precondition declines while any open pull request carries a pending change
  under the wiki root - a human's edit in flight as much as the task's own - and on paths it could
  not read, a third state that also carries the gate through an engine older than this one.
- **Landed:** #1257 (Closes #1256) · pack version 60823.3.

## 2026-08-31 · policy-changed · Auto-merge policies scope a folder inline and intersect (#1474)
- **Reason:** the task's whole write surface is the wiki root, which the policy vocabulary could not
  name, so it had been approximating itself with a repo-wide documentation class.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the automerge policy becomes the wiki root intersected with the documentation
  class, against the same constant the precondition anchors on, so a doc elsewhere in the repo and a
  non-doc file inside the wiki both park the round. On a member whose mount predates the vocabulary
  the policy reads as invalid, which is also a park, never a wider merge.
- **Landed:** #1474 (Closes #1473) · pack version 60830.3.

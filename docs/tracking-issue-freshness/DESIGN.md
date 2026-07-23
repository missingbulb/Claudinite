# Tracking-issue freshness — keep the plan issue in sync after every merge (design)

> **Status: proposed.** Tracked by [#409](https://github.com/missingbulb/Claudinite/issues/409)
> (the `plan-tracking` issue — the "read status and pick up the work" entry point). This
> doc is the rationale and the design record; the phased plan lives as a checklist there.

## The problem

The owner's convention for a major task is two artifacts, each with a distinct job:

- a **source-controlled design doc / migration plan** — the durable, reviewable
  rationale and the phased recipe (e.g. [`docs/per-project-scheduling/MIGRATION.md`](../per-project-scheduling/MIGRATION.md));
- a **GitHub tracking issue** — the live "read status and pick up the work" point the
  next agent hits first, carrying a `- [ ]` / `- [x]` checklist of the plan's items
  (e.g. [#394](https://github.com/missingbulb/Claudinite/issues/394)).

These two drift. When a phase lands, the committed plan gets its status box updated in
the same PR (it's in the diff, so review forces it), but **the issue checklist is a
separate surface no diff touches** — so it silently falls behind. The drift is already
live: `per-project-scheduling/MIGRATION.md` now says Phase 1 is *"same day, no soak"*,
while #394's Phase 1 item still reads *"Soak ~1 week."* An agent that reads the issue
first — which is exactly what the issue is *for* — reads a stale plan.

The committed plan is drift-guarded by code review; the issue is drift-guarded by
nobody. This design adds that guard.

## The invariant

For a task under a plan:

1. there is **exactly one open tracking issue** ("there should always be one");
2. its description carries a **todo checklist** (`- [ ]` / `- [x]` items); and
3. **after each merge that advances a plan item, the checklist is brought in sync** —
   the checkbox flipped and/or a status comment added, in the same session as the merge.

Point 3 is the one this design enforces mechanically. Points 1–2 are conventions the
same mechanism can *observe* (and self-skip on when absent), not manufacture.

The update happens **after the merge, not before**: a plan item isn't "done" until it's
on `main`, so flipping its box pre-merge would record a claim the branch hasn't earned.
That timing is the whole reason the existing check surfaces can't carry this — see next.

## Why the existing check-the-work surface can't carry it

The natural instinct is a check-the-work rule on the Stop hook. It doesn't fit, for two
independent reasons:

1. **The Stop hook fast-exits on a clean tree.** [`engine/hooks/stop-command.mjs`](../../engine/hooks/stop-command.mjs)
   runs the work sweep only when a tracked file differs from the merge-base (or the tree
   is dirty). The merge-to-main recipe ends with `git checkout main && git pull` — so the
   moment right after a merge is a **clean tree at `main`**, and the Stop hook runs
   nothing. The post-merge instant is structurally invisible to the work sweep.
2. **The verification needs the network; the Stop hook is offline.** Confirming "the
   tracking issue's checklist was updated" means reading the issue's body and timeline
   over the GitHub API. Per [`engine/checks/DESIGN.md`](../../engine/checks/DESIGN.md)
   ("Enforcement wiring"), the Stop hook runs only offline rules; config/network checks
   need a network-capable surface.

So a Stop-hook rule can see neither the *right moment* nor the *right data*.

## The surface: the post-merge capture step

There already is a deterministic thing that runs at exactly the right moment: the
**conversation-capture step** the merge-to-main recipe invokes right after the merge
lands (`grow_with_claudinite`'s [`capture-log.mjs`](../../packs/grow_with_claudinite/capture-log.mjs) —
the owner's "save the current conversation"). It is:

- **anchored to the post-merge instant** — the recipe calls it immediately after
  `merge_pull_request`, in-session, before the turn ends;
- **network-capable** — it runs in the session, where the GitHub MCP tools and a token
  are available; and
- **already issue-aware** — it takes `--issue <n>`.

That is the surface. We add a **tracking-issue freshness verifier** that runs at capture
time and, when the invariant is violated, emits a check-the-work–style reminder the
agent must satisfy before ending the turn — the same "the finding is the instruction"
economy as every other check, just fired from the capture surface instead of the Stop
hook.

This is a **check-the-work** in spirit, not a check-the-world acceptance: it is
conversation/merge-scoped, satisfiable by *doing the work* (update the issue), and
**self-skips** when its precondition is absent — never a permanent suppression for a
one-session artifact (`engine/checks/DESIGN.md`, "Acceptances are the escape hatch").

## Detection

Run at capture time, after the merge:

1. **Find the active tracking issue.** Convention: the single **open** issue carrying a
   `plan-tracking` label. Zero open → self-skip (no plan in flight). More than one open →
   surface it as its own finding (the "exactly one" invariant), naming them, rather than
   guessing which to check.
2. **Require a checklist.** The issue body must contain a Markdown task list
   (`- [ ]` / `- [x]`). None → skip the freshness check (but this is worth an *advisory*:
   a `plan-tracking` issue with no checklist can't be the pick-up-the-work point it
   claims to be).
3. **Decide freshness.** The issue counts as brought-in-sync this session when **either**
   - the session transcript shows an `issue_write` (update) / `add_issue_comment` /
     `sub_issue_write` targeting that issue number *after* the merge tool call, **or**
   - the issue's `updated_at` postdates the session's start (a body edit made this
     session, even one the transcript slicing missed).

   Neither → **finding**: *"You merged #\<work\> but left tracking issue #\<plan\>'s
   checklist untouched. Bring it in sync now — flip the item(s) this merge completed;
   editing the checklist is preferred, a status comment is the floor."*

The transcript signal is the primary one (offline-derivable, precise about *this*
session); `updated_at` is the backstop so a legitimate edit is never nagged.

## Shape rules that keep it convergent

Copying the discipline the conversation-surface rules already follow
(`feature-requirements-first`, `comment-classification`):

- **Self-skip without a transcript** and without an active tracking issue — a manual run,
  a conversational turn, or a repo with no plan in flight costs nothing and fires nothing.
- **Scope to the merge that just happened.** Only a session that actually merged is
  judged; earlier merges are never re-litigated (the capture step already runs per-merge
  and is delta-aware).
- **Satisfiable by the work.** The only way to clear the finding is to update the issue —
  never an accept, never a rebase. A finding no correct work can clear is a bug in the
  rule.
- **Gate on the pack.** The verifier ships in `grow_with_claudinite` (it already owns the
  capture surface); a repo that removed that pack — or has no `plan-tracking` issue —
  gets nothing, exactly as capture already skips there.

## Enforcement strength

Start as a **hard in-session reminder, not a Stop-block.** The capture step already runs
inside the merge-to-main skill; the cheapest wiring is: capture emits the finding on a
non-zero exit / stderr, and the merge-to-main recipe gains a step — *"if the freshness
verifier reports a stale tracking issue, update it before ending the turn."* That keeps
the enforcement where the action already is and needs no new hook.

Escalate to a true Stop-block only if telemetry shows the in-session reminder gets
ignored — the same "fail fast, then measure" governance the checks system uses. (A
Stop-block is buildable — a conversation-scoped work rule gated on the transcript showing
a merge *and* no post-merge issue update, fired before the local `main` sync while the
branch still differs from base — but it's strictly more fragile than the capture-anchored
reminder and shouldn't be the first cut.)

## Open decisions for the owner

- **Label name.** `plan-tracking` is the proposal; #394 currently carries none, so the
  convention needs seeding (this issue is the first to wear it).
- **"Exactly one open" — enforce or observe?** Treat >1 open `plan-tracking` issue as a
  blocking finding, or merely report it? (Proposed: report, don't block — merging two
  plans is a judgment call.)
- **Checklist edit vs. comment as the floor.** The design accepts a status comment as the
  minimum and prefers a checkbox flip. Confirm the floor is acceptable, or require the
  box flip.

## Phased plan

The checklist that follows lives in the tracking issue (this doc's counterpart); it is
reproduced here only as the design's summary of scope.

1. **Convention + seed** — define the `plan-tracking` label and its meaning in the
   `grow_with_claudinite` / merge docs; apply it to the existing in-flight tracker(s)
   (#394).
2. **Verifier** — add the freshness check beside the capture step (`grow_with_claudinite`),
   with a red-first fixture (fires on a stale checklist, quiet on a fresh one and on a
   no-plan repo).
3. **Recipe wiring** — the merge-to-main skill runs the verifier at the capture moment
   and requires the agent to satisfy a stale finding before ending the turn.
4. **Docs** — record the convention in the pack README and this doc's status box; point
   the tracking issue at this doc.
5. **(Contingent) Stop-block escalation** — only if telemetry shows the in-session
   reminder is ignored.

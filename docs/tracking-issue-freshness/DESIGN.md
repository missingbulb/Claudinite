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

1. one or more open tracking issues carry the **`plan-tracking`** label (we do **not**
   enforce a count — but any issue that wears the label is subject to points 2–3);
2. such an issue's description carries a **todo checklist** (`- [ ]` / `- [x]` items); and
3. **after each merge that advances a plan item, the checklist is brought in sync** — the
   checkbox **flipped** (preferred and, where detectable, required — a bare status comment
   is not sufficient), in the same session as the merge.

The update happens **after the merge, not before**: a plan item isn't "done" until it's
on `main`, so flipping its box pre-merge would record a claim the branch hasn't earned.
That post-merge timing is the whole design problem — see next.

## The hard constraint: no GitHub credential in-session

The decisive fact (it rules out two tempting designs). The corpus enforces a **blocking**
rule, [`in-session-github-access`](../../packs/grow_with_claudinite/skills/unattended-agents/in-session-github-access.mjs):
in-session code (routines, migrations, the merge/capture step) has **no shell GitHub REST
credential** — it reaches GitHub only through the session's MCP tools; a `GITHUB_TOKEN` or
`api.github.com` read in in-session code is a hard finding (it caused a real fleet no-op
day). Only two actors can touch GitHub: the **agent** (MCP, in-session) and a **CI
executor** (token, off-session).

Consequence: **no deterministic in-session check can read the issue over the API** — not
at the Stop hook, and not bolted onto the post-merge capture step (an earlier draft of
this doc proposed the capture step; that's wrong for exactly this reason — a check there
would be as offline as the Stop hook, or it would violate `in-session-github-access`). An
in-session check is **transcript-only**.

That is not a limitation — it's the key that unlocks the clean design.

## The design: a post-merge check-the-work rule, offline, transcript-scoped

The session transcript already records the MCP tool calls — including
`merge_pull_request` (with its PR number and title) **and** any subsequent `issue_write` /
`add_issue_comment` (with the target issue number and the full new body text). So a
transcript-scoped rule can assert, with **zero network and no credential**:

> "This session merged PR #X and then did **not** update a tracking issue's checklist
> afterward → sync the `plan-tracking` issue and flip the item(s) this merge completed."

It reads both the merge and the checklist edit straight from the tool-call arguments. This
keeps the whole thing inside the offline check-the-work framework — no new scope, no
capture-step coupling.

**Two pieces make it work:**

1. **`work.mergedThisSession()`** — a new accessor on the fluent work view
   ([`engine/checks/helpers/work.mjs`](../../engine/checks/helpers/work.mjs)) returning the
   PRs this session accepted (`[{ pr, title, issue, time }]`), parsed from the transcript's
   `merge_pull_request` tool-use entries. A reusable primitive: "the accepted PRs from the
   current session," offline, available to any future post-merge rule.
2. **A post-merge Stop trigger.** Today [`engine/hooks/stop-command.mjs`](../../engine/hooks/stop-command.mjs)
   fast-exits when the tree matches the merge-base — and the merge recipe ends with
   `git checkout main && git pull`, leaving a **clean tree on `main`**, so the runner never
   fires post-merge. The fix is small and general: the hook peeks the transcript for a
   merge and treats **"merged this session"** as a second reason not to fast-exit, alongside
   "tree differs from base." One cheap transcript scan makes **post-merge a first-class
   check-the-work timing** — reusable beyond this one rule.

## Detection (the rule)

Runs at Stop, once the post-merge trigger lets the runner through:

1. **Gate on a merge.** `work.mergedThisSession()` empty → self-skip (no merge, nothing to
   sync). No transcript (manual/CI run) → self-skip.
2. **Look for the sync.** Scan the transcript for an `issue_write` (update) /
   `add_issue_comment` / `sub_issue_write` call **after** the latest merge whose body
   contains a task-list edit (`- [x]` / `- [ ]`).
   - Found → pass (the agent brought a checklist in sync post-merge).
   - Not found → **finding**: *"You merged PR #X but didn't flip a checklist item on a
     tracking issue afterward. Update the `plan-tracking` issue — flip the box(es) this
     merge completed; a bare status comment isn't enough."*
3. **Convergence.** The transcript is append-only; once the agent does the `issue_write`,
   the next Stop sees it and passes. The Stop hook's existing 2-block loop guard bounds it.

**Precision ceiling (honest).** Offline, the rule confirms the agent updated *a* checklist
issue post-merge; it cannot confirm that issue carried the `plan-tracking` label (a GitHub
read). Two ways to close the gap, either acceptable:

- **Accept the transcript evidence** — an agent flipping a checklist box right after a
  merge is precisely the behavior we want; the label check adds little.
- **World-scope backstop** — a **network** check ([DESIGN.md](../../engine/checks/DESIGN.md)
  "config check" tier: CI/fleet, off-session, where the token legitimately lives) asserting
  the standing invariant "no open `plan-tracking` issue is behind its merged phases." Precise
  (it reads the box) but not in-session-timely — a slower net under the timely nudge.

## Belt and suspenders: the recipe asks, the check guarantees

Mirroring the corpus principle *"prose is a request; the post-hoc check is the guarantee"*:
the `merge-to-main` skill gains an explicit step — *after the merge, update the
`plan-tracking` issue's checklist* — so the update usually happens before the first
post-merge Stop even fires (the rule then passes on the first try). The rule is the
backstop for when it doesn't.

## Shape rules that keep it convergent

The discipline the conversation-surface rules already follow
(`feature-requirements-first`, `comment-classification`):

- **Self-skip** without a transcript and without a merge this session — a manual run, a
  conversational turn, or a no-merge turn costs nothing and fires nothing.
- **Scope to the latest merge.** Earlier merges are never re-litigated.
- **Satisfiable by the work.** The only way to clear it is to update the issue — never an
  accept, never a rebase.
- **Gate on the pack.** The rule ships in `grow_with_claudinite` (which owns the
  merge/growth surface); a repo without that pack gets nothing.

## Decisions (resolved with the owner)

- **Label name:** `plan-tracking`. ✅
- **"Exactly one open" — enforce?** No. We don't police the count; any issue wearing the
  `plan-tracking` label is subject to the freshness invariant. ✅
- **Checkbox flip vs. comment floor:** require a **checkbox flip** where detectable; a bare
  status comment is not sufficient. ✅

## Phased plan

The checklist that follows lives in the tracking issue (this doc's counterpart); it is
reproduced here only as the design's summary of scope.

1. **Convention + seed** — define the `plan-tracking` label and its meaning in the
   `grow_with_claudinite` / merge docs; apply it to the existing in-flight tracker(s)
   (#394).
2. **Primitive + trigger** — add `work.mergedThisSession()` (transcript-derived) and the
   Stop hook's post-merge trigger (don't fast-exit when the transcript shows a merge), each
   with red-first tests.
3. **Verifier** — the freshness rule in `grow_with_claudinite`, red-first fixture: fires
   when a merge happened with no post-merge checklist edit, quiet when the agent flipped a
   box, quiet on a no-merge / no-plan session.
4. **Recipe wiring** — `merge-to-main` gains the "update the `plan-tracking` issue after the
   merge" step.
5. **Docs** — record the convention in the pack README; flip this doc's status box; point
   the tracking issue at this doc.
6. **(Contingent) world-scope backstop** — a network check (CI/fleet) for the label-precise
   "no open `plan-tracking` issue is behind its merged phases," only if the transcript
   evidence proves insufficient.

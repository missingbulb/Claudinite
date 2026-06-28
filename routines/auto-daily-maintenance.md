# Consolidated daily maintenance routine (the single scheduled entry point)

A portable, **project-agnostic** spec for the **one** daily Claude Code routine a consuming repo schedules. It carries no maintenance logic of its own — it is a thin orchestrator that runs every daily maintenance routine in turn, deferring each member's behavior entirely to that member's own doc. The point is twofold: bootstrapping a project's upkeep becomes **registering a single schedule** instead of three, and every member is **guaranteed to run each day** because the orchestrator isolates them — one member failing, stalling, or exiting early cannot stop the others.

This routine **replaces scheduling the members individually.** Schedule *this* one; do not also schedule the members it drives (you'd double-run them). The members' specs stay exactly as written — they're unchanged and still vendored — this routine only sequences them.

## Conventions used in this doc

- **Default branch.** Below, `main` stands for **your repository's default branch** — substitute whatever your repo uses.
- **GitHub API access.** The members open PRs / read PRs / file issues through your environment's GitHub API tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a **git-over-HTTPS proxy with no GitHub API**; there, use the MCP tools, never `gh` / `curl`. Use whichever your runtime exposes. The orchestrator itself only touches its own tracking issue (below), and only on a failure.

## The members

Every daily/nightly maintenance routine a consuming repo runs, dispatched by this one:

1. [auto-lessons.md](auto-lessons.md) — the daily lessons digest (opens a PR; most days nothing).
2. [auto-optimize-procedures.md](auto-optimize-procedures.md) — reconcile local docs against the pinned canon both ways (a PR down, one bundled handoff issue up).
3. [auto-branch-report.md](auto-branch-report.md) — the nightly open-branch status report (read-only on the repo; its own tracking issue).

Not a member: [claudinite-handoff.md](claudinite-handoff.md) is a **deterministic Action**, not a scheduled routine — it fires off the handoff label, so it is not dispatched here.

**Extending it is the whole simplification:** when a new daily routine is added, add **one line** to this member list — do **not** register a new schedule. The single scheduled routine then picks it up automatically the next day.

## How it runs the members — isolation is the guarantee

Dispatch **each member as its own subagent**, one per member. The subagent boundary is what delivers the guarantee the owner cares about:

- **Failure isolation.** A member that errors, stalls, or exits early fails *its own* subagent only; the orchestrator still launches every other member. No member can take the day's run down with it.
- **Context isolation.** Each member runs in a clean context, so one member's large diff or long transcript doesn't crowd out another's.
- **Behavior unchanged.** Each subagent runs its member **exactly as that member's doc specifies** — same write surface, same PR-vs-issue output, same own tracking issue, same "most days do nothing," same "never merge." This routine adds **no** new behavior to any member; it only decides *that* and *in what isolation* they run, never *what* they do.

The members are mutually independent — they open PRs on distinct dated branches, file distinct issues, and the branch report is read-only — so they **cannot collide**, and may run **concurrently** for speed. Run them in parallel subagents; do not serialize on one member's slow run. Pass each subagent the member's own thin-pointer launcher prompt (from that member's doc) verbatim, substituting your default branch and the path where you vendored the member.

Wait for **all** members to settle before finishing — a launched-but-unwaited member is not a guaranteed run.

## What the orchestrator itself must not do

The orchestrator is a sequencer, not a maintainer. It **never** merges, pushes, edits docs, opens a member's PR, or writes to a member's tracking issue — every such action belongs to the member that owns it, inside that member's own subagent. The orchestrator's *only* write is the failure log on its own tracking issue (next section). Keep it that thin; resist the temptation to "fix up" a member's output from the orchestrator.

## Tracking: log only failures, on the orchestrator's own issue

This routine keeps its **own** standing tracking issue, separate from each member's — found **by title**, never a hard-coded number (a bare number can dangle, and it differs per repo); open it if it doesn't exist, reopen it if it was closed while a run still needs logging.

It logs **failures only** — the orchestrator's job is to guarantee every member *ran*, so the one thing worth surfacing is a member that **didn't** complete:

- **Any member's subagent failed, stalled, or exited without completing** → post a **dated comment** on this issue naming which member(s) failed and the error/symptom, so a silently-skipped run can't go unnoticed. This is exactly the case a member can't self-report — a member that crashes before reaching its own logging step leaves no trace on its own issue, so the orchestrator is the only thing that can record it.
- **All members completed** (whether they made changes or correctly did nothing) → **log nothing.** Members already log their own *changes* to their own issues; a daily "all green" roll-up here would just be noise. Silent days stay silent.

So on a normal day this routine writes nothing at all — the members speak for themselves through their own PRs and issues — and the only entries that ever accumulate here are the failures you actually need to see.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions the project later adds. Vendor this file (and the member files) somewhere in your repo (e.g. under a `routines/` path of your choosing), then schedule **this one routine** daily, pasting a prompt like the following and substituting the path where you vendored these docs and your default branch:

> Run the consolidated daily maintenance routine for this repository exactly as specified in `<path/to/auto-daily-maintenance.md>`: dispatch **every** member listed in that doc as its own subagent — concurrently and in isolation, so one member failing can't stop the others — each running its member's own launcher prompt verbatim per that member's doc. Wait for all members to settle. You are a sequencer only: never merge, push, edit docs, or write to any member's tracking issue — each member owns its own output. Log **only failures** to this routine's own standing tracking issue (found **by title**), naming which member(s) didn't complete; on a clean day where every member finished, log nothing.

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger). The repo can't schedule itself, so this doc is the spec and the routine is the trigger.

## Run on a capable model

Every member makes **judgment calls** (squash/superseded detection, deciding whether a lesson is genuinely new, proving a local item is covered by the canon before pruning it). A downgraded model fails these silently — see each member's own "run on a capable model" note. Run this routine, and therefore its member subagents, on a capable model.

## What this routine must never do

- **Never run a member's logic itself** — it dispatches members into subagents; it does not merge, push, edit docs, or open any member's PR/issue.
- **Never let one member's failure block another** — each member runs in its own isolated subagent, and every member is launched regardless of how the others fare.
- **Never schedule the members separately as well** — this routine is their single schedule; double-scheduling double-runs them.
- **Never log on a clean day** — it logs only failures to its own tracking issue; members self-report their own changes.
- **Never inline this spec, or a member's spec, into the launcher** — the launcher stays a thin pointer here, and this routine passes each member its own thin-pointer prompt.

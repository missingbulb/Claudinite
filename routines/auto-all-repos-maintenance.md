# Fleet daily maintenance routine (the single scheduled entry point)

A portable, **project-agnostic** spec for the **one** daily routine that maintains **every repo the owner has opted into Claudinite** — scheduled once, from a single home repo, and reaching all the others. It carries no maintenance logic of its own: it is a thin orchestrator that discovers the fleet and, for each opted-in repo, dispatches every daily maintenance **member routine** directly as its own isolated subagent, deferring each member's behavior entirely to that member's own doc. The point is twofold: the owner registers **a single schedule** for **all** their repos instead of one per repo, and every member is **guaranteed to run** in every repo each day because the orchestrator isolates each (repo, member) run — one repo, or one member, failing, stalling, or exiting early cannot stop the others.

This routine dispatches the members **directly**, per repo — there is no intermediate per-repo orchestrator to schedule. It **replaces** scheduling the members individually **and** replaces any per-repo maintenance schedule: schedule *this* one, in one home repo, and nothing else. Do **not** also schedule the members (you'd double-run them), and do **not** register a per-repo maintenance routine inside each repo (this routine already covers every repo). The members' specs stay exactly as written — unchanged and still vendored — this routine only decides *which repos* run them and *in what isolation*.

## Conventions used in this doc

- **Home repo.** This routine is scheduled from, and keeps its tracking issue in, a single fixed **home repo** — the repo where you vendor and schedule this doc (for the reference deployment, that's Claudinite itself). "Home repo" below means that repo; every *other* repo it maintains is a **member repo**.
- **Default branch.** Each member repo's own default branch is whatever *that* repo uses; the members substitute it per repo, so this routine never assumes `main` for a member repo.
- **GitHub API access, fleet-wide.** This routine reaches **many** repos, so it works entirely through the **GitHub API tooling** your environment exposes (the **GitHub MCP tools**, or `gh` where available) — enumerating repos, reading the opt-in marker, and letting the members open PRs / read PRs / file issues. It needs a token whose scope spans the whole fleet, not just the home repo. In sandboxed/automation environments the shell often reaches only a git-over-HTTPS proxy scoped to the session's own repo and **no cross-repo checkout is possible** — so the members, like this routine, must operate over the API (get-file / push-files / create-PR), never by cloning each member repo. Use the MCP tools there, never `gh`/`curl`. The orchestrator itself only touches its own tracking issue (below), and only on a failure.

## The members

Every daily/nightly maintenance routine, dispatched by this one into every opted-in repo:

1. [auto-lessons.md](auto-lessons.md) — the daily lessons digest (opens a PR; most days nothing).
2. [auto-optimize-procedures.md](auto-optimize-procedures.md) — reconcile local docs against the pinned canon both ways (a PR down, one bundled handoff issue up).
3. [auto-branch-report.md](auto-branch-report.md) — the nightly open-branch status report (read-only on the repo; its own tracking issue).

Not a member: [claudinite-handoff.md](claudinite-handoff.md) is a **deterministic Action**, not a scheduled routine — it fires off the handoff label, so it is not dispatched here.

**Extending it is the whole simplification:** when a new daily routine is added, add **one line** to this member list — do **not** register a new schedule and do **not** add a per-repo dispatch layer. The single scheduled routine then runs it in every opted-in repo automatically the next day.

## Step 1 — discover the fleet (which repos to maintain)

Maintain **only repos that have opted into Claudinite**, detected by the tracked marker every vendored repo carries: a version-controlled **`.claudinite/.gitkeep`** file (bootstrap step 3 commits it as a one-glance signal that the repo mounts Claudinite). A repo without that tracked marker has none of the members vendored, so running them there is meaningless — skip it.

1. **Enumerate every repo the token can access** — page through the full list (repo-search / list-repositories tooling); do not stop at the first page. Missing a repo here silently drops it from the day's run, so enumeration must be exhaustive.
2. **Keep only opted-in repos** — for each candidate, confirm a **tracked `.claudinite/.gitkeep` on that repo's default branch** (a get-file-contents check is authoritative; a fleet-wide code search for the marker is a fine fast pre-filter, but the search index lags, so confirm with the file check before acting). No marker → skip.
3. **Drop repos that can't be maintained** — skip **archived / read-only** repos (a PR can't be opened against them). Skipping these is normal, not a failure; don't log them.

The result is the day's **member-repo list**. If enumeration itself fails or returns only partially (an API error mid-page), you **cannot guarantee the fleet was covered** — treat that as a failure and log it (see Tracking), because a repo dropped by a broken enumeration looks identical to a repo that has no work.

## Step 2 — run every member in every repo, in isolation

For **each** member repo, dispatch **each member as its own subagent** — a grid of (repo, member) runs, one subagent per cell. The subagent boundary is what delivers the guarantee the owner cares about:

- **Failure isolation.** A run that errors, stalls, or exits early fails *its own* subagent only; every other member, in that repo and every other, still runs. No single member and no single repo can take the day's run down with it.
- **Context isolation.** Each cell runs in a clean context, so one member's large diff or one repo's long transcript doesn't crowd out another's.
- **Behavior unchanged.** Each subagent runs its member **exactly as that member's doc specifies** — same write surface, same PR-vs-issue output, same own tracking issue (in that member repo), same "most days do nothing," same "never merge." This routine adds **no** new behavior to any member; it only decides *that*, *in what repo*, and *in what isolation* they run, never *what* they do.

Within a repo the members are mutually independent — they open PRs on distinct dated branches, file distinct issues, and the branch report is read-only — and across repos every run is confined to its own repo, so no two cells can collide. They may therefore all run **concurrently** for speed. Run them in parallel subagents; if the fleet is large, cap concurrency to a sane batch size, but **every** cell must be launched and **waited on** — a launched-but-unwaited cell is not a guaranteed run. Pass each subagent its member's own thin-pointer launcher prompt (from that member's doc) verbatim, substituting **the target member repo**, that repo's default branch, and the path where it vendored the member (conventionally `.claudinite/routines/`).

Wait for **all** cells to settle before finishing.

## What the orchestrator itself must not do

The orchestrator is a sequencer, not a maintainer. It **never** merges, pushes, edits docs, opens a member's PR, or writes to a member's tracking issue — every such action belongs to the member that owns it, inside that member's own subagent, in that member's repo. The orchestrator's *only* write is the failure log on its **own** tracking issue in the home repo (next section). Keep it that thin; resist the temptation to "fix up" a member's output from the orchestrator.

## Tracking: log only failures, on the home repo's own issue

This routine keeps its **own** standing tracking issue **in the home repo**, separate from every member's — found **by title**, never a hard-coded number (a bare number can dangle, and it differs per repo). Open it if it doesn't exist; reopen it if it was closed while a run still needs logging.

It logs **failures only** — the orchestrator's job is to guarantee every member *ran* in every opted-in repo, so the one thing worth surfacing is a run that **didn't** complete:

- **Any (repo, member) subagent failed, stalled, or exited without completing**, or **fleet enumeration failed / was incomplete** → post a **dated comment** naming the **repo and member** affected (or the enumeration error) and the symptom, so a silently-skipped run can't go unnoticed. This is exactly the case a member can't self-report — a member that crashes before reaching its own logging step leaves no trace on its own issue, and a repo dropped by broken enumeration never started at all.
- **Every member completed in every opted-in repo** (whether it made changes or correctly did nothing) → **log nothing.** Members already log their own *changes* to their own issues in their own repos; a fleet-wide "all green" roll-up here would just be noise. Silent days stay silent.

So on a normal day this routine writes nothing at all — the members speak for themselves through their own PRs and issues in their own repos — and the only entries that ever accumulate on the home issue are the failures you actually need to see.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions the project later adds. Vendor this file (and the member files) in your home repo (e.g. under a `routines/` path of your choosing), then schedule **this one routine** daily, pasting a prompt like the following and substituting the path where you vendored these docs:

> Run the fleet daily maintenance routine exactly as specified in `<path/to/auto-all-repos-maintenance.md>`. Enumerate **every** repo the GitHub token can access (page through all of them), keep only those carrying a tracked `.claudinite/.gitkeep` marker on their default branch, and skip archived/read-only repos. For **each** remaining repo, dispatch **every** member listed in that doc as its own subagent — concurrently and in isolation, so one repo or one member failing can't stop the others — each running that member's own launcher prompt verbatim (per that member's doc), targeting that repo and its default branch. Wait for all runs to settle. You are a sequencer only: never merge, push, edit docs, or write to any member's tracking issue — each member owns its own output in its own repo. Log **only failures** — a (repo, member) run that didn't complete, or a fleet you couldn't fully enumerate — to this routine's own standing tracking issue in this home repo (found **by title**), naming the repo and member affected; on a clean day where every member finished in every opted-in repo, log nothing.

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger), from the home repo. The fleet can't schedule itself, so this doc is the spec and the single home-repo routine is the trigger.

## Run on a capable model

Every member makes **judgment calls** (squash/superseded detection, deciding whether a lesson is genuinely new, proving a local item is covered by the canon before pruning it). A downgraded model fails these silently — see each member's own "run on a capable model" note. This routine's own step (marker detection, complete enumeration, dispatch) is mechanical, but it drives those judgment-heavy members, so run this routine — and therefore its member subagents — on a capable model.

## What this routine must never do

- **Never run a member's logic itself** — it dispatches members into subagents, per repo; it does not merge, push, edit docs, or open any member's PR/issue except its own failure log.
- **Never maintain a non-opted-in repo** — only repos with a tracked `.claudinite/.gitkeep` marker; a missing marker means the members aren't vendored there.
- **Never let one member's or one repo's failure block another** — each (repo, member) cell runs in its own isolated subagent, and every cell is launched and waited on regardless of how the others fare.
- **Never also schedule the members separately, or a per-repo maintenance routine** — this routine is their single schedule across the whole fleet; anything else double-runs them.
- **Never log on a clean day** — it logs only failures to its own home-repo tracking issue; members self-report their own changes to their own issues.
- **Never inline this spec, or a member's spec, into the launcher** — the launcher stays a thin pointer here, and this routine passes each member its own thin-pointer prompt.

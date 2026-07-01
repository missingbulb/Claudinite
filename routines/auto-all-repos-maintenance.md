# Fleet daily maintenance routine (the single cross-repo entry point)

A portable, **project-agnostic** spec for the **one** daily routine that maintains **every repo the owner has opted into Claudinite** — scheduled once, from a single home repo, and reaching all the others. It carries no maintenance logic of its own: it is a thin, two-level orchestrator that discovers the fleet and, for each member repo, defers entirely to that repo's own consolidated daily maintenance flow ([auto-daily-maintenance.md](auto-daily-maintenance.md)). The point is the same guarantee, one level up: the owner registers **a single schedule** for **all** their repos instead of one per repo, and every opted-in repo is **guaranteed to run each day** because the orchestrator isolates them — one repo failing, stalling, or exiting early cannot stop the others.

Read this together with [auto-daily-maintenance.md](auto-daily-maintenance.md): that doc is the single entry point **within one repo** (it fans out the member routines); this doc is the single entry point **across all repos** (it fans out the per-repo flow). They compose — this routine's per-repo subagent runs exactly that doc, unchanged.

This routine **replaces registering `auto-daily-maintenance.md` per repo.** Schedule *this* one, in one home repo; do **not** also schedule the per-repo routine inside each member repo (you'd double-run every repo's maintenance). Nothing about the per-repo flow or its members changes — this routine only decides *which repos* run it and *in what isolation*.

## Conventions used in this doc

- **Home repo.** This routine is scheduled from, and keeps its tracking issue in, a single fixed **home repo** — the repo where you vendor and schedule this doc (for the reference deployment, that's Claudinite itself). "Home repo" below means that repo; every *other* repo it touches is a **member repo**.
- **Default branch.** Each member repo's own default branch is whatever *that* repo uses; the per-repo flow substitutes it per repo, so this routine never assumes `main` for a member.
- **GitHub API access, fleet-wide.** This routine reaches **many** repos, so it works entirely through the **GitHub API tooling** your environment exposes (the **GitHub MCP tools**, or `gh` where available) — enumerating repos, reading the opt-in marker, opening PRs and issues. It needs a token whose scope spans the whole fleet, not just the home repo. In sandboxed/automation environments the shell often reaches only a git-over-HTTPS proxy scoped to the session's own repo and **no cross-repo checkout is possible** — so the per-repo flow, like its members, must operate over the API (get-file / push-files / create-PR), never by cloning each member. Use the MCP tools there, never `gh`/`curl`.

## Step 1 — discover the fleet (which repos to maintain)

Maintain **only repos that have opted into Claudinite**, detected by the tracked marker every vendored repo carries: a version-controlled **`.claudinite/.gitkeep`** file (bootstrap step 3 commits it as a one-glance signal that the repo mounts Claudinite). A repo without that tracked marker has none of the member routines vendored, so running the flow there is meaningless — skip it.

1. **Enumerate every repo the token can access** — page through the full list (repo-search / list-repositories tooling); do not stop at the first page. Missing a repo here silently drops it from the day's run, so enumeration must be exhaustive.
2. **Keep only opted-in repos** — for each candidate, confirm a **tracked `.claudinite/.gitkeep` on that repo's default branch** (a get-file-contents check is authoritative; a fleet-wide code search for the marker is a fine fast pre-filter, but the search index lags, so confirm with the file check before acting). No marker → skip.
3. **Drop repos that can't be maintained** — skip **archived / read-only** repos (a PR can't be opened against them). Skipping these is normal, not a failure; don't log them.

The result is the day's **member-repo list**. If enumeration itself fails or returns only partially (an API error mid-page), you **cannot guarantee the fleet was covered** — treat that as a failure and log it (see Tracking), because a repo dropped by a broken enumeration looks identical to a repo that has no work.

## Step 2 — run each member repo, in isolation

Dispatch **each member repo as its own subagent**, one per repo. The subagent boundary delivers the guarantee the owner cares about, fleet-wide:

- **Failure isolation.** A repo whose run errors, stalls, or exits early fails *its own* subagent only; every other member repo still runs. No single repo can take the fleet's day down with it.
- **Context isolation.** Each repo runs in a clean context, so one repo's large diff or long transcript doesn't crowd out another's.
- **Behavior unchanged.** Each subagent runs that repo's consolidated daily maintenance **exactly as [auto-daily-maintenance.md](auto-daily-maintenance.md) specifies** — which in turn fans out that repo's members with their own write surface, PR-vs-issue output, own tracking issues, "most days do nothing," and "never merge." This routine adds **no** new behavior; it only decides *which repos* run the flow and *in what isolation*.

Member repos are mutually independent — each opens PRs and files issues only within itself — so they **cannot collide** and may run **concurrently** for speed. Run them in parallel subagents; if the fleet is large, cap concurrency to a sane batch size, but **every** opted-in repo must be launched and **waited on** — a launched-but-unwaited repo is not a guaranteed run. Pass each subagent the per-repo launcher prompt from [auto-daily-maintenance.md](auto-daily-maintenance.md) verbatim, substituting **that repo** as the target, its default branch, and the path where it vendored the routine docs (conventionally `.claudinite/routines/`).

Wait for **all** member repos to settle before finishing.

## What the orchestrator itself must not do

This routine is a two-level sequencer, not a maintainer. It **never** merges, pushes, edits docs, opens a PR, or writes to any member repo's tracking issue — every such action belongs deep inside a member repo's per-repo flow, which owns it. Its *only* write is the failure log on its **own** tracking issue in the home repo (next section). Keep it that thin; resist "fixing up" a member repo's output from the orchestrator.

## Tracking: log only failures, on the home repo's own issue

This routine keeps its **own** standing tracking issue **in the home repo**, separate from every per-repo and member issue — found **by title**, never a hard-coded number (a bare number can dangle). Open it if it doesn't exist; reopen it if it was closed while a run still needs logging.

It logs **repo-level failures only** — this routine's job is to guarantee every opted-in repo *ran*, so the one thing worth surfacing is a repo that **didn't**:

- **A member repo's per-repo run failed, stalled, or exited without completing**, or **fleet enumeration failed / was incomplete** → post a **dated comment** naming the repo(s) affected and the error/symptom, so a silently-skipped repo can't go unnoticed. This is exactly the case nothing else can self-report: a per-repo run that crashes before reaching its own logging leaves no trace on that repo's issue, and a repo dropped by broken enumeration never started at all.
- **Every opted-in repo completed** (whether it made changes or correctly did nothing) → **log nothing.** Each repo's own orchestrator already logs *its* member failures to *its* issues, and each member logs its own changes; a fleet-wide "all green" roll-up here would just be noise.

Do **not** duplicate the inner layers: a member-routine failure *within* a repo is logged by that repo's orchestrator on that repo's issue — not here. This routine logs only the outer layer: a whole per-repo run that didn't complete, or a fleet that couldn't be fully enumerated. On a normal day it writes nothing at all.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions added later. Vendor this file in your home repo alongside the per-repo docs it dispatches (e.g. under `routines/`), then schedule **this one routine** daily, pasting a prompt like the following and substituting the path where you vendored these docs:

> Run the fleet daily maintenance routine exactly as specified in `<path/to/auto-all-repos-maintenance.md>`. Enumerate **every** repo the GitHub token can access (page through all of them), keep only those carrying a tracked `.claudinite/.gitkeep` marker on their default branch, and skip archived/read-only repos. Dispatch **each** remaining repo as its own subagent — concurrently and in isolation, so one repo failing can't stop the others — each running that repo's consolidated daily maintenance exactly as `auto-daily-maintenance.md` specifies (its per-repo launcher prompt, verbatim, targeting that repo and its default branch). Wait for all repos to settle. You are a sequencer only: never merge, push, edit docs, or write to any member repo's issue — each repo owns its own output. Log **only failures** — a per-repo run that didn't complete, or a fleet you couldn't fully enumerate — to this routine's own standing tracking issue in this home repo (found **by title**), naming the repo(s) affected; on a clean day where every opted-in repo finished, log nothing.

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger), from the home repo. The fleet can't schedule itself, so this doc is the spec and the single home-repo routine is the trigger.

## Run on a capable model

Every layer below this makes **judgment calls** — squash/superseded detection, deciding whether a lesson is genuinely new, proving a local item is covered by the canon before pruning it. A downgraded model fails these silently. This routine's own step (marker detection, complete enumeration, per-repo dispatch) is mechanical, but it drives those judgment-heavy flows, so run this routine — and therefore its per-repo subagents and their members — on a capable model.

## What this routine must never do

- **Never run any maintenance logic itself** — it dispatches per-repo flows into subagents; it does not merge, push, edit docs, or open any PR/issue except its own failure log.
- **Never maintain a non-opted-in repo** — only repos with a tracked `.claudinite/.gitkeep` marker; a missing marker means the member routines aren't vendored there.
- **Never let one repo's failure block another** — each repo runs in its own isolated subagent, and every opted-in repo is launched and waited on regardless of how the others fare.
- **Never also schedule `auto-daily-maintenance.md` inside the member repos** — this routine is their single schedule; double-scheduling double-runs them.
- **Never log on a clean day, and never duplicate the inner layers' logs** — it logs only outer-layer failures (a per-repo run that didn't complete, or incomplete enumeration) to its own home-repo issue.
- **Never inline this spec, or the per-repo spec, into the launcher** — the launcher stays a thin pointer here, and this routine passes each repo the per-repo doc's own thin-pointer prompt.

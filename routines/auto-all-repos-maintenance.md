# Fleet daily maintenance routine (the single scheduled entry point)

A portable, **project-agnostic** spec for the **one** daily routine that maintains **every repo the owner has opted into Claudinite** — scheduled once, from a single home repo, and reaching all the others. It carries no maintenance logic of its own: it is a thin orchestrator that discovers the fleet and sequences the [growth lifecycle](../growth/README.md) across it, plus the nightly repo tidy-up, deferring each step's behavior entirely to that step's own doc. The point is twofold: the owner registers **a single schedule** for **all** their repos instead of one per repo, and every step is **guaranteed to run** in every repo because the orchestrator isolates each run — one repo, or one step, failing, stalling, or exiting early cannot stop the others.

This routine **replaces** scheduling anything individually **and** replaces any per-repo maintenance schedule: schedule *this* one, in one home repo, and nothing else. Do **not** also schedule the phases, and do **not** register a per-repo maintenance routine inside each repo (this routine already covers every repo). The step specs stay exactly as written — this routine only decides *which repos* run them, *in what order*, and *in what isolation*.

## Conventions used in this doc

- **Home repo.** This routine is scheduled from, and keeps its tracking issue in, a single fixed **home repo** — the repo where you vendor and schedule this doc (for the reference deployment, that's Claudinite itself). "Home repo" below means that repo; every *other* repo it maintains is a **member repo**.
- **Default branch.** Each member repo's own default branch is whatever *that* repo uses; the phases substitute it per repo, so this routine never assumes `main` for a member repo.
- **GitHub API access, fleet-wide.** This routine reaches **many** repos, so it works entirely through the **GitHub API tooling** your environment exposes (the **GitHub MCP tools**, or `gh` where available) — enumerating repos, reading the opt-in marker, reading each project's docs, and committing. It needs a token whose scope spans the whole fleet. In sandboxed/automation environments the shell often reaches only a git-over-HTTPS proxy scoped to the session's own repo and **no cross-repo checkout is possible** — so every step, like this routine, must operate over the API (get-file / push-files / create-commit), never by cloning each member repo. Use the MCP tools there, never `gh`/`curl`.

## What it sequences

Three things run each day. This routine only **sequences** them across the fleet — what each actually does lives in its own doc, not here:

1. The **[growth lifecycle](../growth/README.md)** — runs in **phases, with a barrier between each**, over every opted-in repo. That doc owns the phases and their order; this routine just drives them in it. The specs it dispatches:
   - [../growth/extract.md](../growth/extract.md) — phase 1, per member repo.
   - [../growth/promote.md](../growth/promote.md) — phase 2, central, once.
   - [../growth/dedup.md](../growth/dedup.md) — phase 3, per member repo.
2. The **[nightly repo tidy-up](auto-repo-tidy.md)** — independent of the growth phases (no ordering constraint), run per member repo **and** against the home repo.
3. The **re-bootstrap** — independent of the growth phases (no ordering constraint), run per member repo **only** (never the home repo — the canon doesn't mount itself). It refreshes each consumer's Claudinite mount and *wiring* by re-running the idempotent bootstrap ([../bootstrap.md](../bootstrap.md), the content of the `adopt-claudinite` skill). This is the only step that renews the parts that **don't** self-update at session start — the `sync-claudinite.sh` generated artifact, the `settings.json` hook registrations, the `.claude/skills/` symlinks, the gitignore rules, the pack declaration (Method B re-syncs the corpus *contents* each session, but never this wiring; Method A's pinned submodule drifts in both). Like every step it opens a **PR** for the owner to approve and, since these repos are already on the routine's maintenance access list (that's how it reached them), it **skips bootstrap's enrollment-issue step** (Part 4) — the repo is provably already enrolled. Most days nothing has drifted and it opens no PR; the owner's "try to re-bootstrap" is exactly that — attempt it every day, act only when there's drift.

**Extending it:** a new per-repo growth phase is a line in the growth lifecycle; a new independent routine (like the repo tidy-up or the re-bootstrap) is another entry here. Never register a new schedule and never add a per-repo dispatch layer — the single scheduled routine runs everything in every opted-in repo automatically the next day.

## Step 1 — discover the fleet (which repos to maintain)

Maintain **only repos that have opted into Claudinite**, detected by the tracked `.claudinite/` signal every vendored repo carries. Mounting the corpus commits that signal in one of two forms, depending on the mount method (see [bootstrap.md](../bootstrap.md)) — **both count**:

- **Method B (tarball sync):** a version-controlled **`.claudinite/.gitkeep`** file.
- **Method A (submodule):** a **`.claudinite` submodule registered in `.gitmodules`** pointing at the Claudinite repo.

1. **Enumerate every repo the token can access** — page through the full list; do not stop at the first page. Missing a repo here silently drops it from the day's run, so enumeration must be exhaustive.
2. **Keep only opted-in repos** — for each candidate, confirm **either signal on that repo's default branch** via the API: a get-file-contents on `.claudinite/.gitkeep` (Method B), **or** `.gitmodules` naming a `.claudinite` submodule whose URL is the Claudinite repo (Method A). A fleet-wide code search is a fine fast pre-filter, but the search index lags, so confirm with the file check before acting. Don't assume only one method across the fleet.
3. **Drop repos that can't be maintained** — skip **archived / read-only** repos (a commit can't be pushed to them). Skipping these is normal; don't log them.
4. **The home repo is not a member repo** — it is the canon, not a Claudinite *consumer*, so it never carries the opt-in marker and steps 1–2 never reach it. Include it **only** for the repo tidy-up — its own PRs, branches, and issues still need tending — and do **not** run the growth phases against it (the growth lifecycle targets consumers, not the canon itself).

The result is the day's **member-repo list**. If enumeration itself fails or returns only partially, you **cannot guarantee the fleet was covered** — treat that as a failure and log it (see Tracking).

## Step 2 — run the flow: phased, with barriers, in isolation

The growth phases run in a **fixed order with a barrier between each** — the [growth lifecycle](../growth/README.md) owns that order and why; this routine's job is only to honor it. So unlike a flat grid of independent members, run the phases **in sequence, waiting for each to fully settle before starting the next**. Within a phase the per-repo runs are independent and run **concurrently**; the barrier only gates one phase against the next.

Dispatch **each per-repo run as its own subagent**, instructing it to run that phase per its doc (targeting the repo and its default branch). The subagent boundary delivers the guarantee the owner cares about: **failure isolation** (a run that errors, stalls, or exits early fails *its own* subagent only), **context isolation** (a clean context per run), and **behavior unchanged** (each subagent runs its phase **exactly as that phase's doc specifies**). This routine adds **no** behavior to any phase.

Run the growth phases in their numbered order (phase 1 → 2 → 3 above), waiting at each barrier before the next. Run the independent **repo tidy-up** and **re-bootstrap** concurrently alongside them — neither has an ordering dependency. Run the repo tidy-up per member repo **and** against the home repo; run the re-bootstrap per member repo **only** (never the canon). The re-bootstrap's subagent runs the idempotent bootstrap over the API — never a clone — and opens its own PR against the member's default branch, separate from any growth PR (they touch different files: growth writes the project's local docs, re-bootstrap only the `.claude/` wiring, generated artifact, symlinks, gitignore, and pack declaration).

If the fleet is large, cap concurrency **within** a phase to a sane batch size, but **every** run in a phase must be launched and **waited on** — a launched-but-unwaited run is not a guaranteed run, and an un-awaited earlier phase means a later phase runs on incomplete input. Wait for **everything** to settle before finishing.

## What the orchestrator itself must not do

The orchestrator is a sequencer, not a maintainer. It **never** merges, commits docs, edits the canon, opens a phase's PR/commit, or writes to a phase's tracking issue — every such action belongs to the phase that owns it, inside that phase's own subagent. The orchestrator's *only* write is the failure log on its **own** tracking issue in the home repo (next section). Keep it that thin.

## Tracking: log only failures, on the home repo's own issue

This routine keeps its **own** standing tracking issue **in the home repo**, separate from every phase's — found **by title**, never a hard-coded number. Open it if it doesn't exist; reopen it if it was closed while a run still needs logging.

It logs **failures only** — the orchestrator's job is to guarantee every phase *ran* where it should, so the one thing worth surfacing is a run that **didn't** complete:

- **Any subagent failed, stalled, or exited without completing** (name the repo and phase), or **fleet enumeration failed / was incomplete**, or **a barrier could not be reached** (a phase-1 or phase-2 run never settled, so the next phase ran on incomplete input) → post a **dated comment** naming what was affected and the symptom.
- **Every phase completed everywhere it should** (whether it changed anything or correctly did nothing) → **log nothing.** Phases already log their own *changes* to their own issues; a fleet-wide "all green" roll-up here would just be noise.

So on a normal day this routine writes nothing at all, and the only entries that ever accumulate on the home issue are the failures you actually need to see.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy. Vendor this file (and the [growth/](../growth/README.md) and repo-tidy-up specs) in your home repo, then schedule **this one routine** daily, pasting a prompt like the following and substituting the path where you vendored these docs:

> Run the fleet daily maintenance routine exactly as specified in `<path/to/routines/auto-all-repos-maintenance.md>`. Enumerate **every** repo the GitHub token can access (page through all of them), keep only those carrying the tracked `.claudinite/` opt-in signal on their default branch (a `.claudinite/.gitkeep` file, or a `.claudinite` submodule in `.gitmodules` pointing at Claudinite), and skip archived/read-only repos. Then run the **growth lifecycle** (see `growth/README.md`) across them in isolated subagents — its phases in order, waiting for each to settle at the barrier before the next, each phase run per its doc (targeting the repo and its default branch, opening a PR against it for the owner to approve, never committing to `main` or merging). Run the independent **repo tidy-up** (`auto-repo-tidy.md`) concurrently, in every member repo **and** against this home repo. Also run, concurrently and independently, a **re-bootstrap** of each member repo (never this home repo): re-run the idempotent bootstrap (`bootstrap.md`) over the API to refresh its Claudinite mount, wiring, and generated artifacts, opening a PR against its default branch only if something drifted, and **skipping the enrollment-issue step** (the repo is already enrolled — that's how you reached it). Wait for everything to settle. You are a sequencer only: never commit docs, edit the canon, or write to any step's tracking issue. Log **only failures** — a run that didn't complete, a barrier never reached, or a fleet you couldn't fully enumerate — to this routine's own standing tracking issue in this home repo (found **by title**), naming the repo and phase affected; on a clean day, log nothing.

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI nightly trigger), from the home repo.

## Run on a capable model

Every phase makes **judgment calls** — see each phase's own "run on a capable model" note. This routine's own step (marker detection, enumeration, dispatch) is mechanical, but it drives those judgment-heavy phases, so run this routine — and therefore its subagents — on a capable model.

## What this routine must never do

- **Never run a phase's logic itself** — it dispatches phases into subagents; it does not merge, commit, edit docs, or open any phase's output except its own failure log.
- **Never maintain a non-opted-in repo** — only repos with a tracked `.claudinite/` marker.
- **Never re-bootstrap the home repo** — re-bootstrap targets consumers only (the canon doesn't mount itself); only the repo tidy-up runs against home. And never re-open the enrollment issue on a re-bootstrap — a repo the routine reached is already enrolled.
- **Never let one run's failure block another** — each run is its own isolated subagent, and every run is launched and waited on regardless of how the others fare.
- **Never break the phase ordering** — run the growth phases in the lifecycle's order, waiting at each barrier; only the repo tidy-up and re-bootstrap are unordered.
- **Never also schedule the phases separately, or a per-repo maintenance routine** — this routine is their single schedule across the whole fleet.
- **Never log on a clean day** — it logs only failures to its own home-repo tracking issue.
- **Never inline this spec, or a phase's spec, into the launcher** — the launcher stays a thin pointer here.

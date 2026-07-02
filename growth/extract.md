# Growth phase 1 — extract lessons (per project)

A portable, **project-agnostic** spec for the daily Claude Code routine that reviews the last 24h of activity and folds any durable, reusable lesson into the project's **own** Markdown docs — the first phase of the [growth lifecycle](README.md) (extract → [promote](promote.md) → [dedup](dedup.md)). Any consuming repo can run it: it makes **no assumptions about a particular project's files, services, or doc layout** beyond "the project keeps its guidance in Markdown docs." It runs unattended, so **most days it correctly adds nothing.**

> This is the **unattended daily** routine. The on-demand, in-session "learned lessons" command the owner triggers by hand is a *separate* thing that stays a PR for review (see the owner's preferences and [tasks/extracting-lessons.md](../tasks/extracting-lessons.md)); this daily routine commits straight to the project's own default branch.

## This phase captures — it does not generalize

Keep every lesson in the **language of the current project**: name its files, its services, its concrete mechanics. **Do not** generalize, abstract, or try to make a lesson portable here — that is [phase 2](promote.md)'s job, run centrally over every project at once. A lesson phrased for this one repo is exactly what this phase wants; over-generalizing here just pre-empts (worse) the judgment the promote phase is built to make. Capture specifically, let promote lift.

## Conventions used in this doc

- **Default branch.** Below, `main` stands for **your repository's default branch** — substitute `master`, `trunk`, `develop`, or whatever your repo uses.
- **GitHub API access.** Reading issue/PR activity and updating the tracking issue go through your environment's GitHub API tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a **git-over-HTTPS proxy with no GitHub API**; there, use the MCP tools, never `gh` / `curl`, which will fail or hang. Use whichever your runtime actually exposes.
- **The doc that owns a lesson.** "Route each to the doc that owns it" means whichever of *your local* docs covers that kind of lesson — a gotchas doc, an engineering-practices doc, an architecture doc, a procedures doc. This spec only says *route by kind*; the target files are the consuming project's own.

## How it finds lessons (scoped to the last 24h)

1. **Activity gate, first.** Count commits + updated issues/PRs in the window. If there were none, stop — a quiet day has nothing to learn from.
2. **Read the window.** The last-24h **commits** (`git log --since`, full bodies, diffs where a fix is non-obvious) and **issue/PR activity** (`updated:>=<since>`, then the changed comments).
3. **Extract only durable, reusable lessons** — gotchas, engineering practices, test discipline, architecture rules, project mechanics — and **dedupe** each against the existing local docs. When in doubt, leave it out; adding noise is worse than adding nothing.
4. **Route each to the local doc that owns it**, keeping every addition terse and in this project's own voice (see the routing convention above).
5. **Most days: nothing** — no edits, no commit. That's what keeps the capture worth reading.

Its write surface is **Markdown docs only** — never code, tests, or workflows. If an edit lands in a doc that a test reads (some projects guard doc constants in tests), run the project's offline test suite and keep it green before pushing.

## Output: commit straight to main

If it found at least one genuinely new lesson, it **commits the doc edits and pushes them to `main` directly** — no PR, no human gate. This is an unattended routine writing a project's *own local* docs (not the shared canon), captured on a capable model; the owner has opted these daily routines into direct-to-main. Keep each commit terse and reference the routine's tracking issue (below). Most days there is nothing to commit.

## Tracking: log each run under the routine's own issue

When a run adds a lesson, log it on this routine's standing tracking issue — found **by title**, never a hard-coded number (a bare number can dangle, and it differs per repo); open it if it doesn't exist. Log the run as a **dated comment** on that issue — **not** a sub-issue — so the issue accumulates a scrollable history of every run over time, and each entry names **what instruction was added to this project and where**. The issue is long-lived: if it was **closed**, **reopen it** when a run needs logging. Each daily automated routine keeps its **own** such issue — a running self-improvement log of what it did.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions the project later adds. This phase is normally dispatched by the fleet orchestrator ([routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)), which passes a prompt like the following, substituting the target repo and its default branch:

> Run growth phase 1 (extract lessons) for this repository exactly as specified in `<path/to/growth/extract.md>`: review the last 24h of commits and issue/PR activity, extract only genuinely new, durable, reusable lessons (deduped against the existing local docs), and **if any qualify**, route each into the local doc that owns it, phrased in **this project's own specific language** — do not generalize. Edit **Markdown docs only**, keep the offline test suite green, **commit and push straight to `main`** (no PR), and log the run — naming what was added and where — on the routine's standing tracking issue (found **by title**). Most days, find nothing and do nothing.

## Run on a capable model

Deciding whether a lesson is genuinely new and durable — and deduping it against the existing docs — is a **judgment call**, not mechanical extraction. A downgraded model floods the docs with noise or restates what's already there, and here it commits that noise straight to `main` with no PR to catch it. Run this routine on a capable model.

## What this routine must never do

- **Never generalize a lesson** — capture it in this project's own language; generalizing is [phase 2](promote.md)'s job.
- **Never write outside Markdown docs** — no code, tests, or workflows.
- **Never touch the shared canon** — this phase writes only the project's *own* local docs.
- **Never pad the docs** — most days add nothing; a duplicate or hallucinated "lesson" is worse than silence, and worse still when it lands on `main` unreviewed.
- **Never inline this spec into the launcher** — the launcher stays a thin pointer here.

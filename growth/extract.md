# Growth phase 1 — extract lessons (per project)

Phase 1 of the [growth lifecycle](README.md): review a project's recent activity and fold any durable, reusable lesson into the project's own docs — at the project's own level, without straining to generalize it. It opens a PR against the project's default branch for the owner to approve; finding nothing to add on a given run is a perfectly good outcome.

> This is the **unattended daily** routine. Like the owner's on-demand, in-session "learned lessons" command, it delivers its edits as a PR for review — an unattended routine never commits straight to `main`.

## Capture at the project's own level

Write each lesson at whatever level reads naturally for this project — refer to its files, services, or mechanics wherever that's what makes the lesson clear, but don't force either extreme: don't contort a lesson to be hyper-specific, and don't polish it into a general, portable rule. Making a lesson portable is [promote](promote.md)'s job, done centrally later; here, just capture it usefully and let promote lift whatever turns out to travel.

## Conventions used in this doc

- **Default branch.** `main` stands for **your repository's default branch** — substitute whatever your repo uses.
- **GitHub API access.** Reading issue/PR activity and updating the tracking issue go through your environment's GitHub API tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a **git-over-HTTPS proxy with no GitHub API**; there, use the MCP tools, never `gh` / `curl`. Use whichever your runtime exposes.
- **The project's local docs.** The set identified in [growth/README.md](README.md) — the project's own guidance, never the mounted canon.

## How it finds lessons (scoped to the last 24h)

1. **Activity gate, first.** Count commits + updated issues/PRs in the window. None → stop; a quiet day has nothing to learn from.
2. **Read the window.** The last-24h **commits** (`git log --since`, full bodies, diffs where a fix is non-obvious) and **issue/PR activity** (`updated:>=<since>`, then the changed comments).
3. **Extract only durable, reusable lessons** — gotchas, engineering practices, test discipline, architecture rules, project mechanics — and **dedupe** each against what the project already documents. When in doubt, leave it out.
4. **Put each lesson where it will be read.** A lesson can land in the local doc that owns its kind, or — for a gotcha tied to one call site — as a comment right at that site. Which fits is a placement call [extracting-lessons.md](extracting-lessons.md) owns (usage-site comment vs. central doc); follow it rather than defaulting everything to a doc. Keep each addition terse and in the project's own voice.

If an edit touches something a test reads (a doc constant, a code path), run the project's offline test suite and keep it green before pushing.

## Output: open a PR for review

If it found at least one genuinely new lesson, it **commits the edits on a branch and opens a PR against `main`** for the owner to approve — never a direct push to `main`. This is an unattended routine, on a capable model, writing the project's *own* docs (not the shared canon); the owner wants a human approval gate on every growth change. Keep the commit and PR terse and reference the tracking issue. A run that finds nothing and opens no PR is fine — and common.

## Tracking: log each run under the routine's own issue

When a run adds a lesson, log it on this routine's standing tracking issue — found **by title**, never a hard-coded number (a bare number can dangle, and it differs per repo); open it if it doesn't exist, reopen it if it was closed while runs still need logging. Log the run as a **dated comment** — not a sub-issue — so the issue accumulates a scrollable history, each entry naming **what was added and where**.

## Run on a capable model

Deciding whether a lesson is genuinely new and durable — and deduping it against what's already documented — is a **judgment call**, not mechanical extraction. A downgraded model adds noise or restates what's there; the review PR is a backstop, but a weak model just floods the owner with low-value PRs to review. Run this routine on a capable model.

## What this routine must never do

- **Never touch the shared canon** — this phase writes only the project's *own* docs; lifting a lesson up into the canon is [promote](promote.md)'s job.
- **Don't add noise** — a duplicate or hallucinated "lesson" is worse than adding nothing, the more so when it becomes a PR the owner must review.

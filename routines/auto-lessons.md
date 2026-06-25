# Automated daily "lessons" digest

A portable, **project-agnostic** spec for a daily Claude Code routine that reviews
the last 24h of activity and folds any durable, reusable insight into the
project's own Markdown docs — the scheduled counterpart of an on-demand "learned
lessons" pass. Any consuming repo can run it: it makes **no assumptions about a
particular project's files, services, or doc layout** beyond "the project keeps
its guidance in Markdown docs." It runs unattended, so **most days it correctly
adds nothing.**

## Conventions used in this doc

- **Default branch.** Below, `main` stands for **your repository's default
  branch** — substitute `master`, `trunk`, `develop`, or whatever your repo uses.
- **GitHub API access.** Opening the PR goes through your environment's GitHub API
  tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation
  environments the shell often reaches only a **git-over-HTTPS proxy with no
  GitHub API**; there, use the MCP tools, never `gh` / `curl`, which will fail or
  hang. Use whichever your runtime actually exposes.
- **The doc that owns a lesson.** "Route each to the doc that owns it" means
  whichever of *your* local docs covers that kind of lesson — a gotchas doc, an
  engineering-practices doc, an architecture doc, a procedures doc. This spec only
  says *route by kind*; the target files are the consuming project's own.

## How it finds lessons (scoped to the last 24h)

1. **Activity gate, first.** Count commits + updated issues/PRs in the window. If
   there were none, stop — a quiet day has nothing to learn from.
2. **Read the window.** The last-24h **commits** (`git log --since`, full bodies,
   diffs where a fix is non-obvious) and **issue/PR activity** (`updated:>=<since>`,
   then the changed comments).
3. **Extract only durable, reusable lessons** — gotchas, engineering practices,
   test discipline, architecture rules, project mechanics — and **dedupe** each
   against the existing docs. When in doubt, leave it out; adding noise is worse
   than adding nothing.
4. **Route each to the local doc that owns it**, keeping every addition terse (see
   the routing convention above).
5. **Most days: nothing** — no branch, no PR, no edits. That's what keeps the
   digest worth reading.

Its write surface is **Markdown docs only** — never code, tests, or workflows. If
an edit lands in a doc that a test reads (some projects guard doc constants in
tests), run the project's offline test suite and keep it green before pushing.

## Output: a PR, never a merge

If it found at least one genuinely new lesson, it opens a **PR for review** on a
dated branch with a random suffix (the suffix keeps two same-day runs from
colliding on one branch name). It never merges: a human reviews the PR — the docs
are guidance everyone reads, so a hallucinated or duplicative "lesson" is worse
than nothing — and from there it merges through the project's usual flow. The PR
references this routine's tracking issue (below), so its activity is collected
there.

## Tracking: log each run under the routine's own issue

When a run produces a PR, log it on this routine's standing tracking issue — found
**by title**, never a hard-coded number (a bare number can dangle, and it differs
per repo); open it if it doesn't exist. Log the run as a **dated comment** on that
issue — **not** a sub-issue — so it accumulates a scrollable history of every run
over time; also reference the issue from the PR. The issue is long-lived: if it
was **closed**, **reopen it** when a run needs logging (a closure while the
routine is still producing PRs is stale). Each daily automated routine keeps its
**own** such issue — a running self-improvement log of what it did. **This applies
to future daily routines too:** when a new one is added, open its own tracking
issue and log its output the same way — as comments, not sub-issues.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy —
inlined instructions drift against renamed paths and miss conventions the project
later adds. Vendor this file somewhere in your repo (e.g. under a `docs/` or
`routines/` path of your choosing), then paste a prompt like the following into
your daily routine, substituting the path where you placed it and your default
branch name:

> Run the daily lessons digest for this repository exactly as specified in
> `<path/to/auto-lessons.md>`: review the last 24h of commits and issue/PR
> activity, extract only genuinely new, durable, reusable lessons (deduped
> against the existing docs), and **if any qualify**, open a PR on a dated branch
> routing each lesson into the local doc that owns it. Edit **Markdown docs
> only**, keep the offline test suite green, and log the run on the routine's
> standing tracking issue (found **by title**). Most days, find nothing and do
> nothing. **Never merge.**

Schedule it daily in your scheduler (the Claude Code Routines UI, a cron, or a CI
nightly trigger). The repo can't schedule itself, so this doc is the spec and the
routine is the trigger.

## Run on a capable model

Deciding whether a lesson is genuinely new, durable, and portable — and deduping
it against the existing docs — is a **judgment call**, not mechanical extraction.
A downgraded model floods the docs with noise or restates what's already there.
Run this routine on a capable model.

## What this routine must never do

- **Never merge** — it only opens a PR for human review.
- **Never write outside Markdown docs** — no code, tests, or workflows.
- **Never pad the docs** — most days add nothing; a duplicate or hallucinated
  "lesson" is worse than silence.
- **Never inline this spec into the launcher** — the launcher stays a thin pointer
  here.

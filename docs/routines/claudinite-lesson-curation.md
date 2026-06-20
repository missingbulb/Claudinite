# Claudinite lesson-curation routine

Operational spec for the unattended routine that turns inbound
`claudinite-lesson` proposal issues into reviewed docs PRs against this repo's
**portable corpus** — the flat `*.md` rule files at the repo root that consuming
repos mount read-only as a git submodule.

This doc is the spec. The Claude Code launcher that runs the routine is a **thin
pointer** to this file, never an inlined copy of it (see
[agenticBestPractices.md](../../agenticBestPractices.md) — "Keep an unattended
routine's instructions in a repo doc, not inlined in the launcher's config"). The
routine is a concrete instance of the "daily lessons pass" and "standing tracking
issue" rules in that same doc.

This file is Claudinite-internal operations: it is **not** part of the mounted
corpus, and consuming repos do not `@import` it.

## How proposals arrive

A consuming repo's daily "optimize-procedures" routine spots a portable lesson in
its *local* docs and files a `claudinite-lesson`-labelled issue there. A
deterministic Action in that repo (`claudinite-lesson-handoff.yml`) copies the
issue **here** as a new `claudinite-lesson`-labelled issue — carrying a
provenance backlink to the source issue — then closes the source.

So every issue this routine sees is a **self-contained proposal that assumes no
knowledge of the originating repo**. Judge it on its own text plus this corpus.
The backlink is provenance only; do not chase it for missing context — if the
proposal can't stand on its own text, that is itself grounds to reject.

## Trigger

One run handles one inbound issue:

- **Label-triggered (preferred):** fire when an issue gains the
  `claudinite-lesson` label in this repo.
- **Daily scan (fallback):** list open `claudinite-lesson` issues and process
  each one not yet handled — no curation PR opened for it and no decision comment
  posted on it yet.

Requires the `claudinite-lesson` label to exist here (see [Label](#label)).

## Run on a capable model

Every step below is a judgment call — portability, duplication, ownership, "does
this clear the bar". Per [agenticBestPractices.md](../../agenticBestPractices.md)
("Match the agent model to the judgment it must make"), run this routine on a
capable model. A downgraded model ships a plausible-but-wrong **acceptance** —
exactly the failure that pollutes the shared canon — where a capable model
correctly rejects.

## What each run does

### 1. Read the proposal

Extract the candidate lesson from the issue: the durable rule it proposes, the
kind of lesson it is, and any worked example. Treat the issue body as the whole
input.

### 2. Identify the owning doc

Route by *kind* to exactly one owning doc:

| Lesson kind | Owning doc |
| --- | --- |
| General software-engineering practice | [engineeringPractices.md](../../engineeringPractices.md) |
| AI-agent practice (building / running agents) | [agenticBestPractices.md](../../agenticBestPractices.md) |
| git / GitHub procedure | [git-and-github.md](../../git-and-github.md) |
| Working discipline / general working habit | [working-discipline.md](../../working-discipline.md) |
| Agent architecture (structuring unattended agents) | [agent-architecture.md](../../agent-architecture.md) |
| Owner interaction preference / trigger phrase | [ownerPreferences.md](../../ownerPreferences.md) |

If a lesson plausibly fits two docs, pick the single best owner — never split one
lesson across docs. If it fits **none** of the six, that is a strong reject
signal: it is probably project-specific, not portable.

### 3. Dedupe ruthlessly — against the *entire* corpus

Read **all six** docs before deciding, not just the owning one. A lesson can
already be covered by a rule living in a different doc, or phrased differently.

Reject (no PR) when any of these holds:

- **Already covered** — the insight already exists anywhere in the corpus, even
  if worded differently or owned by another doc.
- **Not portable** — it leans on a specific project's files, services, or
  mechanics, or only makes sense with that project's context. Portable means
  project-agnostic: true for any consuming repo, read cold.
- **Below the bar** — it isn't a durable, reusable insight: too situational, a
  one-off, a restatement of a generic truism, or already implied by an existing
  rule.

**Default to reject when unsure.** This corpus is read read-only by every
consuming repo, so a wrong or duplicative "lesson" pollutes shared canon and is
worse than nothing. Rejection is a common, valid, expected outcome — even though
most inbound issues were already filtered upstream, dedupe here is the gate.

### 4a. Reject

Post a brief comment on the inbound issue naming the reason (covered by
`<doc>` / not portable / below the bar), open **no** PR, and close the issue as
*not planned*. A human can reopen if they disagree. Log notable rejections to the
tracker (see [Tracking issue](#tracking-issue)); routine, obvious duplicates need
no tracker entry.

### 4b. Accept → open a docs PR

- **Route** the lesson into its owning doc as **one tight rule**, matching that
  doc's existing voice and format (e.g. a bold-thesis bullet in
  `agenticBestPractices.md`; a dense imperative bullet in
  `engineeringPractices.md`; a `##` section in `git-and-github.md`). Keep it
  terse.
- **The worked example stays in its own repo.** Add the distilled, portable rule
  only — do not paste in the originating project's files, issue numbers, or
  example. (The corpus's existing worked-example pointers refer to consuming
  repos; a freshly curated rule carries none unless one already lives in this
  corpus.)
- **Never weaken or restate an existing rule.** If the lesson genuinely sharpens
  one, fold it into that rule with a minimal edit rather than adding a redundant
  bullet — but never dilute what's there. Otherwise add a new terse bullet.
- **Bounded write surface:** edit only the single owning doc. Create no new files
  in the corpus, touch no other doc, and do not "improve" unrelated rules while
  you're in there (per [agent-architecture.md](../../agent-architecture.md)).
- **Open a PR; never push to the default branch.** Branch off the default branch
  with a per-run-unique branch name (append a random suffix — see
  [git-and-github.md](../../git-and-github.md), "An automated job needs a unique
  branch per run"). Reference the inbound issue in the commit and PR
  (`Refs #<inbound>`). **Never merge** — a human reviews and merges.
- **Comment the PR link on the inbound issue.** The inbound issue is the
  canonical home for the lesson until the PR merges; leave it **open** until then
  (it closes when the human merges, or stays as the live record).

### 5. Log the run to the tracker

Append a dated comment to the standing tracking issue for every run that produced
a PR, and for any notable rejection. See [Tracking issue](#tracking-issue).

## Tracking issue

The routine's standing self-improvement log is the issue titled exactly:

> **Auto-Improvements Tracker - Claudinite Lesson Curation**

- **Find it by title, never by a hard-coded number** (a bare number can dangle).
- **Open it if missing; reopen it if it was closed** while runs still need
  logging. Keep it open.
- Log each run as a **dated comment** — not a sub-issue — so the history
  accumulates in one scrollable feed: the date, the inbound issue, and the
  decision (accepted → PR link + owning doc, or notable rejection → reason).
- This tracker must **not** carry the `claudinite-lesson` label — it is not a
  proposal, and labelling it would make the routine try to curate its own log.

## Label

This routine **assumes the `claudinite-lesson` label already exists** in this
repo and does not create or edit it — it only keys its trigger on it. The label
is owned by the party that files the inbound issues: the consuming repo's
`claudinite-lesson-handoff.yml` Action ensures it here idempotently
(create-if-missing, no-op if present) before applying it, per
[git-and-github.md](../../git-and-github.md) ("A workflow that adds a brand-new
label must create it first"). For reference, its canonical definition is color
`BFD4F2`, description "Portable lesson handed off from a consuming repo."

## What this routine must never do

- Never merge a PR, and never push a doc change directly to the default branch.
- Never accept on a tie — default to reject when unsure.
- Never weaken, restate, or duplicate an existing rule.
- Never edit anything outside the one owning doc (no new corpus files, no
  unrelated "improvements"), and never comment on or alter the originating repo.
- Never inline this spec into the launcher — the launcher stays a thin pointer
  here.

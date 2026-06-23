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
provenance backlink to the source issue — then closes the source **as a
duplicate of** the new issue here (GitHub `state_reason: duplicate` with
`duplicate_of` set to the new issue's number), not as *not planned*. This keeps
the source's timeline pointing at the canonical issue that now owns the lesson.

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
| Testing practice (writing trustworthy tests, snapshots, coverage gating) | [testingPractices.md](../../testingPractices.md) |
| Searching / rewriting text across files (grep/sed sweeps, renames, broken references) | [textAndFileManipulation.md](../../textAndFileManipulation.md) |
| AI-agent practice (building / running agents) | [agenticBestPractices.md](../../agenticBestPractices.md) |
| git / GitHub procedure | [git-and-github.md](../../git-and-github.md) |
| Working discipline / general working habit | [working-discipline.md](../../working-discipline.md) |
| Agent architecture (structuring unattended agents) | [agent-architecture.md](../../agent-architecture.md) |
| Owner interaction preference / trigger phrase | [ownerPreferences.md](../../ownerPreferences.md) |

This table is the *current* set of owning docs, not a closed one — read it from
the repo, not from memory, since the corpus can grow (see
[Creating a new corpus doc](#4c-accept--create-a-new-corpus-doc-rare)).

If a lesson plausibly fits two docs, pick the single best owner — never split one
lesson across docs. If it fits **none** of the existing docs, that is *usually* a
reject signal: it is probably project-specific, not portable. The rare exception
— a lesson that is clearly portable and durable but opens a genuinely new
recurring cluster no existing doc owns — is handled by
[§4c](#4c-accept--create-a-new-corpus-doc-rare), not by forcing it into an
ill-fitting doc.

### 3. Dedupe ruthlessly — against the *entire* corpus

Read **every corpus doc** before deciding, not just the owning one. A lesson can
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
- **Bounded write surface:** edit only the single owning doc, touch no other doc,
  and do not "improve" unrelated rules while you're in there (per
  [agent-architecture.md](../../agent-architecture.md)). The **one** sanctioned
  way to add a corpus file is the rare, high-bar path in
  [§4c](#4c-accept--create-a-new-corpus-doc-rare) — and even then the write
  surface is exactly the new doc plus its README and routing-table entries,
  nothing more.
- **Open a PR; never push to the default branch.** Branch off the default branch
  with a per-run-unique branch name (append a random suffix — see
  [git-and-github.md](../../git-and-github.md), "An automated job needs a unique
  branch per run"). Reference the inbound issue in the commit and PR
  (`Refs #<inbound>`). **Never merge** — a human reviews and merges.
- **Comment the PR link on the inbound issue.** The inbound issue is the
  canonical home for the lesson until the PR merges; leave it **open** until then
  (it closes when the human merges, or stays as the live record).

### 4c. Accept → create a new corpus doc (rare)

The default is always to route into an existing doc; this path is the rare
exception, not a routine option. Create a new corpus doc **only** when *all* hold:

- The lesson is clearly portable and durable (it would survive every gate in
  [§3](#3-dedupe-ruthlessly--against-the-entire-corpus) on its own).
- It opens a **genuinely new cluster** — a kind of lesson no existing doc owns —
  that you expect to **recur**, not a lone orphan. A single lesson that fits
  nowhere is almost always a reject, not a new doc.
- Routing it into the closest existing doc would **distort** that doc (force an
  off-topic rule into it, or blur its stated scope) rather than merely sit
  slightly off-center.

When unsure whether a lesson clears this bar, **reject** — same default as
everywhere else. A spurious new doc fragments the corpus and is harder to undo
than a missed one.

When it genuinely clears the bar, the accepting PR touches a **bounded** set and
nothing else:

- **Create the new doc** at the repo root, with the same shape and voice as the
  existing corpus docs: an `H1` title, a short framing paragraph stating it's
  portable / project-agnostic and pointing at adjacent docs, then the one
  distilled rule (terse, no originating-project example — same constraints as
  [§4b](#4b-accept--open-a-docs-pr)).
- **Register it in the same PR**, so the doc never lands orphaned: add it to the
  README contents list, and add a routing-table row to this spec
  ([§2](#2-identify-the-owning-doc)) so future lessons of that kind route to it.
- **Everything else is unchanged from [§4b](#4b-accept--open-a-docs-pr):** open a
  PR off the default branch with a per-run-unique branch name, `Refs #<inbound>`,
  comment the PR link on the inbound issue, and **never merge** — the human review
  is the backstop for this heavier write surface.

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
- Never edit anything outside the one owning doc, and never "improve" unrelated
  rules while you're in there — the sole exception is the rare, high-bar
  new-corpus-doc path in [§4c](#4c-accept--create-a-new-corpus-doc-rare), whose
  write surface is itself bounded to the new doc plus its README and
  routing-table entries. Never comment on or alter the originating repo.
- Never inline this spec into the launcher — the launcher stays a thin pointer
  here.

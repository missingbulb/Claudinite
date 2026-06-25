# Extracting lessons from a working session

Portable guidance for mining an agent ↔ user session — a Claude Code web session,
a CLI run, any working conversation — for durable improvements. This is the
**method** behind a "lessons learned" reflection pass: how to read a finished (or
in-progress) conversation and convert its friction into changes that make the
**next** iteration faster, clearer, and less dependent on human feedback.

The terse rules that *govern* such a pass — run it over recent activity, match the
agent model to the judgment it must make, and run the separate efficiency
analysis — live in [agenticBestPractices.md](agenticBestPractices.md). This doc is
the how-to for the extraction itself. Project-specific routing (which doc owns
which lesson, which model to use) stays in the consuming repo's own docs.

## The goal

Every pass optimizes for one outcome: **the next run needs less.** Less
clarification, less rework, less waiting, less human steering. Read the session
not as "what did we accomplish" but as "where did this cost more than it should
have, and what durable change removes that cost next time." If a pass can't point
at a concrete next-time saving, it found nothing — and that's fine (see
[below](#no-new-lessons-is-a-valid-and-common-result)).

## What to look for — the friction signals

Read the conversation end to end and hunt for these signatures. Each is a place
the loop cost more than necessary; each converts to a specific kind of durable
fix.

### 1. Misunderstandings between agent and user

The transcript signs: a clarifying-question round-trip; the user correcting an
assumption ("no, I meant…"); the agent building the wrong thing and reworking it;
the user restating the same request; an `AskUserQuestion` whose answer was, in
hindsight, the obvious default.

**Convert to:** encode the resolved understanding so the next agent never has to
ask. Every question the user answered is a candidate **default**; every correction
is a candidate **convention or glossary entry**; a recurring wrong assumption is a
candidate **confirm-first checkpoint placed earlier**, or a clearer doc the agent
reads cold and gets right the first time. The test of a good fix: next time, the
agent proceeds correctly **without the round-trip**.

### 2. Suboptimal agent actions

The transcript signs: the agent took an approach then backtracked; did redundant
or repeated work; re-ran a command that had already failed for a knowable reason;
reached for a heavy tool where a light one fit; reinvented something the codebase
already provided; re-read a file it had just written to "verify"; missed an
existing convention and had it corrected in review.

**Convert to:** a rule pointing at the right approach or tool, a pointer to the
existing helper/convention so it's found first, or a **footgun note co-located
with the trap** (in the file's own header when you'd only hit it while editing
that file; in a central gotchas doc when you could hit it without reading the
locus). The test: next time, the agent takes the good path first, not after a
detour.

### 3. Long wall-time waits

The transcript signs: independent operations run **serially** that had no
dependency and could have been parallel; a padded fixed `sleep` that over- or
under-shot; a process **waited out after its result was already in hand**; blind
long polling; re-running a check (e.g. CI) that was already green.

**Convert to:** a batch/parallelize rule, a poll-with-rolling-backoff instead of a
blind sleep, kill-the-process-once-its-output-is-in-hand, or merge-on-an-already-
green-check. (Most of these are the subject of the standing **efficiency
analysis** in [agenticBestPractices.md](agenticBestPractices.md) — fold a wall-time
finding into that frame rather than re-deriving it here.) The test: the same
result, less wall clock, no loss of quality.

## From signal to lesson — the bar

A friction signal is only worth writing down when the fix is **durable, reusable,
and generalizable beyond this one session**. Before adding anything:

- **Dedupe ruthlessly** against the existing docs — a lesson already covered
  (even worded differently, even in another doc) is not a new lesson.
- **Route to the doc that owns it**, and keep the addition **terse** — one tight
  rule in the existing voice. A genuinely new, *recurring* cluster that no doc
  owns can warrant a new doc, but that's a rare, deliberate exception; when
  unsure, route into the closest doc or drop it — never spin up a doc for a lone
  lesson.
- **One-offs don't qualify.** A situational detail, a restatement of a generic
  truism, or something already implied by an existing rule is below the bar.

## "No new lessons" is a valid — and common — result

Most sessions yield nothing durable, and that's the expected outcome. Say so and
write nothing rather than padding the docs to look productive: a spurious or
duplicative "lesson" pollutes the canon and costs every future reader. **Default
to no edit when unsure** — the bar is a genuinely new, reusable insight, not a
diary of what happened.

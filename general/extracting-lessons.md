# Extracting lessons from a working session

> **Scope: a single agent ↔ user conversation — not the nightly routine.** This
> doc is about reflecting on the **session you just worked through** and mining
> the *dialogue and the actions taken in it* for improvements. It is **not** the
> automated/nightly routine that extracts insights from **issues, PRs, and
> commits** over repo history — that routine never sees the conversation, and the
> friction signals below (a clarifying round-trip, a backtrack, a wait you sat
> through) live only in the live session.

Portable guidance for mining an agent ↔ user session — a Claude Code web session,
a CLI run, any working conversation — for durable improvements. This is the
**method** behind an on-demand "lessons learned" / retrospective pass: read the
conversation you just had and convert its friction into changes that make the
**next** run faster, clearer, and less dependent on human feedback.

Run the reflection on a **capable model.** Extraction is mechanical, but deciding
*what clears the bar* is a judgment call a weaker model fails silently — it ships
a plausible-but-wrong "lesson" where a capable model correctly bails (see
[agenticBestPractices.md](agenticBestPractices.md), "Match the agent model to the
judgment it must make"). The terse rules that *govern* the pass — run it, plus the
separate efficiency analysis — also live there; this doc is the how-to.

## The goal

Every pass optimizes for one outcome: **the next run needs less.** Less
clarification, less rework, less waiting, less human steering. Read the session
not as "what did we accomplish" but as "where did this cost more than it should
have, and what durable change removes that cost next time." If a pass can't name a
concrete next-time saving, it found nothing — and that's fine (see [No new
lessons](#no-new-lessons-is-a-valid--and-common--result)).

## When to run it

On demand when the user asks, and proactively at a natural close of a unit of work
— e.g. **just after a merge to main**, reflecting on the work that just landed.
**Never reflect-and-edit unprompted in the middle of a task** — it interrupts the
work; the user decides when a session is done enough to mine.

## What to look for — the friction signals

Read the conversation end to end and hunt for these signatures. Each marks a place
the loop cost more than necessary, and each converts to a specific durable fix.

### 1. Misunderstandings between agent and user

The signs: a clarifying-question round-trip; the user correcting an assumption
("no, I meant…"); the agent building the wrong thing and reworking it; the user
restating the same request; an `AskUserQuestion` whose answer was, in hindsight,
the obvious default.

**Convert to:** encode the resolved understanding so the next agent never has to
ask. Every question the user answered is a candidate **default**; every correction
is a candidate **convention or glossary entry**; a recurring wrong assumption is a
candidate **confirm-first checkpoint placed earlier**, or a clearer doc the agent
reads cold and gets right the first time. The test of a good fix: next time the
agent proceeds correctly **without the round-trip**.

### 2. Suboptimal agent actions

The signs: the agent took an approach then backtracked; did redundant or repeated
work; re-ran a command that had already failed for a knowable reason; reached for
a heavy tool where a light one fit; reinvented something the codebase already
provided; re-read a file it had just written to "verify"; missed an existing
convention and had it corrected in review.

**Convert to:** a rule pointing at the right approach or tool, a pointer to the
existing helper/convention so it's found first, or a **footgun note placed where
it'll be read.** Co-locate it in a file's own header comment when you'd only hit
the trap *while editing that file* (a mistake of commission); put it in a central
gotchas doc when you could hit it *without* reading that file (a mistake of
omission, or a cross-cutting invariant). The test: next time the agent takes the
good path first, not after a detour.

### 3. Long wall-time waits — and measure them

The signs: independent operations run **serially** that had no dependency and
could have been parallel; a padded fixed `sleep` that over- or under-shot; a
process **waited out after its result was already in hand**; blind long polling;
re-running a check (e.g. CI) that was already green.

**Measure, don't hand-wave.** Quantify the wait with real wall-clock numbers and
separate the kinds of time — compute (a compile, a test/render run) vs. genuine
**idle waiting** (sleeps, polling, a finished process not yet killed). A fix is
only credible against numbers; name the **single highest-leverage change** that
shortens it, or conclude it was already optimal.

**Convert to:** a batch/parallelize rule, a poll-with-rolling-backoff instead of a
blind sleep, kill-the-process-once-its-output-is-in-hand, or merge-on-an-already-
green-check. (These are the subject of the standing **efficiency analysis** in
[agenticBestPractices.md](agenticBestPractices.md) — fold a wall-time finding into
that frame rather than re-deriving it.) The test: same result, less wall clock, no
loss of quality.

## Encode the questions the user keeps asking

The single highest-leverage move for **less human feedback**: the questions a user
asks *repeatedly* are a checklist the agent should run **itself.** If the user
keeps asking "how many processes ran — could it be fewer?", "what took longest?",
"did you kill it the moment its work was done?", stop waiting to be asked — fold
those exact questions into a **standing self-check the agent answers proactively**
at the end of the relevant work, and close with a terse verdict (a concrete
change, or an explicit "already optimal"). Each recurring question converted this
way is one the user never has to ask again — and it's where a *measured*
retrospective comes from: the user's recurring efficiency questions, answered
pre-emptively, with numbers.

## From signal to lesson — the bar

A friction signal is only worth writing down when the fix is **durable, reusable,
and generalizable beyond this one session.** Before adding anything:

- **Dedupe ruthlessly** against the existing docs — a lesson already covered (even
  worded differently, even in another doc) is not a new lesson.
- **Route to the doc that owns it**, and keep the addition **terse** — one tight
  rule in the existing voice. A genuinely new, *recurring* cluster that no doc owns
  can warrant a new doc, but that's a rare, deliberate exception; when unsure,
  route into the closest doc or drop it — never spin up a doc for a lone lesson.
- **Promote what's portable.** A lesson true for projects beyond this one belongs
  in shared, cross-project canon, not buried in one repo's local docs — hand it up
  through whatever cross-project promotion path your project uses, rather than
  letting a reusable insight stay stuck locally.
- **One-offs don't qualify.** A situational detail, a restatement of a generic
  truism, or something already implied by an existing rule is below the bar.

## "No new lessons" is a valid — and common — result

Most sessions yield nothing durable, and that's the expected outcome. Say so and
write nothing rather than padding the docs to look productive: a spurious or
duplicative "lesson" pollutes the canon and costs every future reader. **Default
to no edit when unsure** — the bar is a genuinely new, reusable insight, not a
diary of what happened.

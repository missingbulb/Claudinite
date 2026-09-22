## 2026-09-01 · born · converted from references.md (writing-tasks-1): "Every run is bounded."
- **Reason:** The bound and its best-effort enforcement are the task-code-work design's §2 and §6
  — see issue #394.
- **Mechanism:** a step of the writing-tasks skill, a workflow

## 2026-09-07 · strengthened · converted from references.md (writing-tasks-2)
- **Reason:** Owner correction on #1843: "Don't discuss how the PRs land in the task description.
  This should have been instructed in the skill on writing tasks." The rule against repeating a
  declaration in `task.md` already existed but listed field names, so the two worker docs that
  spelled the behaviour out without naming `expected_outcome` — `rule-revalidation` and
  `growth-dedup` — passed it, and `rule-revalidation`'s sentence was still describing a policy the
  declaration had moved off.
- **Mechanism:** a step of the writing-tasks skill, a workflow
- **Retire when:** Retire it if the landing story stops living in the declaration.

## 2026-09-13 · strengthened · converted from references.md (writing-tasks-3)
- **Reason:** Owner, 2026-09-13, on the fleet shepherd: "Ignore the 'mount freshness / claudinite
  update status', and 'tasks scheduler health' in the dashboard for repos with dormant
  claudinite-tasks packs. Also do not perform any fleet-wide operations on them." It reverses the
  earlier reading, in which dormancy stopped the scheduler but not the clock: with no converge and
  no fleet operation reaching the repo, a version gap there is a finding with no owner.
- **Mechanism:** a step of the writing-tasks skill, a workflow
- **Retire when:** Retire it if anything ever converges a dormant member's mount again.

## 2026-09-20 · reworded · the cadence vocabulary it teaches (#2182)
- **Reason:** `due:<cadence>` and `last-run-over:<duration>` were the two cadence terms this taught;
  the first is now the retired spelling of `schedule:at-most-<cadence>` and the second is deleted,
  so a task author reading this would have written a term that no longer exists. The bullet also
  lost rationale that had grown onto it: why the vocabulary changed is #1995, not something an
  author needs while writing a task.
- **Actor:** @missingbulb (owner).
- **Landed:** #2182

## 2026-09-21 · reworded · the trigger is stated, never derived (#1789)
- **Reason:** the paragraph told an author that a declaration stating no `trigger` has one derived
  from the shape of its conditions, and that a `frequency` field arrives at the door carrying one.
  Both stopped being true when the derivation was retired, and this is the page an author reads
  while writing the declaration, so the stale reading would have produced a task file that does not
  load at all. The `frequency` half stands on its own window (#1732) and is left as it was.
- **Actor:** the `engine/implement-request` run on work item missingbulb/Claudinite#1789.
- **Model:** claude-opus-5
- **Landed:** #1789

## 2026-09-22 · reworded · the skill stops describing retired mechanisms (#1920)
- **Reason:** three passages named shapes the contract no longer accepts. The ceiling list loses its
  "the retired spellings still normalize" clause and the secrets field its parenthetical, both now
  false. The `session_scope` entry is deleted outright rather than corrected: `writing-pack-prose`
  says to cut a rule whose mechanism has been retired, since one naming code that no longer exists
  teaches a world the reader will not find. Its live half - that a task declares no scope, and reach
  is `invocation_endpoint` - moves up into the contract bullet that already pointed there.
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1920

## 2026-09-22 · reworded · the retired `frequency` field is rejected, not rewritten (#2138)
- **Reason:** the skill told an author that a declaration still carrying `frequency` is rewritten at
  the door into its cadence term, and named the advisory that reported it. Both halves stopped being
  true in the same change: the door is gone, the field is rejected by name, and the advisory had no
  subject left once #1920 removed its other branch, so it was retired with it. Left as it was, the
  skill would have taught the one spelling the contract now refuses.
- **Mechanism:** the paragraph says the field is rejected and told the term to write, with `manual`
  named as the `trigger: 'request'` it always meant; the reference to the retired advisory goes.
- **Actor:** owner session, reconciling #1920 and #2138.
- **Model:** claude-opus-5
- **Landed:** #2138

## 2026-09-22 · reworded · the wrapped work step, and what a worker module holds (#2225)
- **Reason:** the skill taught `code_work` as the only way to declare a work step, so an author
  reading it would keep writing the entry point the runner now supplies. The section says what the
  module exports, what the bag carries and what a returned verdict does, because those are the three
  things an author cannot derive from the declaration alone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5

## 2026-09-22 · reworded · the worker bag names the Action token, and a returned triage fails the run
- **Reason:** every converted worker needed the token the bag already carried, and the `{ triage }`
  verdict had to be described as what it is - a failed run - because the executor reads a park's
  routing only off a non-zero exit, so a worker that parked itself on a clean one would be
  downgrading its own failure into a lane nobody watches.
- **Actor:** @missingbulb (owner), converting every task to the wrapped form.
- **Model:** Opus 5

## 2026-09-22 · reworded · the bag carries the run's instruments, not just its readings
- **Source:** the owner, reading a converted worker's `if (!token) throw` and asking whether a
  configured client could not simply be handed in.
- **Reason:** the executor's workflow sets `GITHUB_TOKEN` on every code-work step, so no run exists
  in which a client cannot be built and every guard on it was a check on a case that cannot occur.
  The same held for three more shapes each worker rebuilt: the logger (fourteen copies of one
  expression), the generated-file delivery (eight arguments the runner already holds, one of them a
  hand-written `<pack>/<task>` literal that a rename leaves stale with no error), and the automerge
  expression (three workers importing their own `task.json` for one string).
- **Mechanism:** `gh`, `log`, `deliver` and `automerge` join the bag. A client on a DIFFERENT
  credential stays the worker's own, and the skill says why: a declared secret can be missing, and
  only the worker can report that in the terms of its whole grant.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5

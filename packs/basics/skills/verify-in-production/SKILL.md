---
name: verify-in-production
description: Decide whether a change that just landed can only be proven in production, and if so file the verification that comes back on its own once it is live. Use at the end of every change, beside the conversation capture — not on request.
---

# Verify in production

A change is finished when someone has watched it work. Most changes you can watch **now**, and
that is the rule — this skill is only for the rest: a change whose proof lives somewhere the
repo cannot see yet. It fires **automatically at the end of a change**, unasked, the way the
conversation capture does. You are filing the proof, not doing the work.

## First: does this file anything at all?

Most changes **file nothing.** Run the test in this order and stop at the first answer:

1. **Did you watch it work in this session?** Then it is proven. File nothing.
2. **Did a test that ran prove it?** A unit test, a CI job, an executable-requirements or UI
   test covering exactly the behaviour that changed. File nothing — the suite is the mechanism
   that comes back.
3. **Does the change have an observable effect at all?** A comment, a design doc, a README, a
   rename with no behavioural edge, a refactor a passing suite already pins. File nothing.
4. **Otherwise: where does its effect first become observable?** If the answer is a place and a
   moment — a member repo once it converges, a site once it deploys, a session once it reloads
   its rules — that is what you file.

The bar is *could not be watched now*, not *would be nice to double-check*. A verification you
file for a change already covered by a test is noise a person has to read and close.

## What you file

**A deferred request** — the same ad-hoc lane `/do-later` rides, so the queue does the waiting,
the running and the lifecycle; nothing here adds machinery beside it. One issue, titled
`Verify in production: <the change, in a few words>`, its body the whole brief: the run that
verifies will never see this conversation and may be days away. Say what changed and why it
could not be watched now, then, each spelled verbatim on its own line:

```
In-production-when: <the concrete artifact to read, and what makes it true>
Verify: <what to observe, and what counts as a pass>
Give-up-after: <YYYY-MM-DD>
Blocked-by: #<the change's PR>
Not-before: <ISO instant just past the expected release>
```

- **`In-production-when:`** names a thing to *read*, never a duration to wait. "`missingbulb/Shepherd`'s
  `.claudinite-checks.json` stamps `packVersions.tidy-repo` at 8 or higher." "The live site's
  `/version.json` reports a version past 4.2.0." "Any session started after this landed — check
  the vendored copy under `.claudinite/shared/` carries the new text." A merge is not a
  production condition, and neither is elapsed time.
- **`Verify:`** is an assertion with a pass condition, not a topic. "Issue #100 on that repo is
  closed with a comment citing the ticks" beats "check tidy-issues works". Name the evidence
  you expect to be able to point at.
- **`Give-up-after:`** is the date past which nobody should keep asking — a few days past the
  release you are waiting on. A change that never reached production is itself news, and this
  is what turns it into one comment instead of a standing chore.
- **`Blocked-by:`/`Not-before:`** are the queue's own wait fields: adoption holds the run until
  the PR has closed **and** the moment has passed. Aim `Not-before:` just past the release you
  expect (the nightly converge plus slack, the next deploy window, +10 minutes for a
  next-session rule) — the run's own re-arm covers a miss, so don't pad it.

Then the labels, as `/do-later` applies them: **`claude-task`** (the mark the tick adopts) and
**`claude-model:sonnet`** (reading a live artifact and judging an assertion against it). Never
`claude-automerge` — a verification has nothing to merge. If `claude-task` doesn't exist in the
repo yet, say so and leave the issue — the labels appear on the next tick.

## Tell the run how to converge

End the body with instructions to the run itself (the issue is its whole brief):

1. Read `In-production-when:` against the real artifact. Never infer it from a merge, a green
   run, or elapsed time.
2. **Live** → run `Verify:`. Passes: comment the evidence actually read (the version, the value,
   the URL) and close this issue as completed. Fails: file a new issue describing what was
   asserted, what happened instead and where you read it; comment here linking it; close this
   issue as completed — the verification did its job by finding the fault, and fixing it is
   separate work with its own review.
3. **Not yet live, and today is before `Give-up-after:`** → re-arm: edit this issue's
   `Not-before:` to the next sensible moment (capped at `Give-up-after:`), re-apply
   `claude-task` and `claude-model:sonnet`, and leave the issue open — the next tick re-adopts
   it. No comment; the bumped field is the record.
4. **Not yet live, past `Give-up-after:`** → comment that the change never reached production
   by that date and what the last read showed, and close as not planned.

## Then say what you filed

One line back to the owner: the issue link, what it waits on, and when it gives up.

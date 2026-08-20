---
name: verify-in-production
description: Decide whether a change that just landed can only be proven in production, and if so file the verification that comes back on its own once it is live. Use at the end of every change, beside the conversation capture — not on request.
---

# Verify in production

A change is finished when someone has watched it work. Most changes you can watch **now**, and
that is the rule — this skill is only for the rest: a change whose proof lives somewhere the
repo cannot see yet. It fires **automatically at the end of a change**, unasked. You are filing
the proof, not doing the work — and the proof itself runs unattended: an automatic check, end
to end, with a person entering only where no automatic check can exist.

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

The bar is *could not be watched now*, not *would be nice to double-check*. A verification
filed for a change already covered by a test is a wasted run re-proving what the suite proved.

## What you file

**A deferred request** — the same ad-hoc lane `/do-later` rides, so the queue does the waiting,
the running and the lifecycle; nothing here adds machinery beside it. One issue, titled
`Verify in production: <the change, in a few words>`, its body the whole brief: the run that
verifies will never see this conversation and may be days away. Say what changed and why it
could not be watched now, then, each spelled verbatim on its own line:

```
Original-issue: #<the change's issue>
In-production-when: <the concrete artifact to read, and what makes it true>
Verify: <what to observe, and what counts as a pass>
Blocked-by: #<the change's PR>
Not-before: <ISO instant just past the expected release>
Retry-every: <how far to push Not-before when not yet live, e.g. 1 day>
```

- **`Original-issue:`** is where a failure lands — the issue the change was done under, which
  the run reopens if the verification fails. Make the verification that issue's **sub-issue**
  too (`mcp__github__sub_issue_write`, method `add`, `issue_number` the original,
  `sub_issue_id` the **id** the create call returned, not its number), so the change it proves
  shows what is still unproven about it.
- **`In-production-when:`** names a thing to *read*, never a duration to wait. "`missingbulb/Shepherd`'s
  `.claudinite-checks.json` stamps `packVersions.tidy-repo` at 8 or higher." "The live site's
  `/version.json` reports a version past 4.2.0." "Any session started after this landed — check
  the vendored copy under `.claudinite/shared/` carries the new text." A merge is not a
  production condition, and neither is elapsed time.
- **`Verify:`** is an assertion with a pass condition, not a topic — and a read an **unattended
  run can make**: an API response, a file at a URL, an issue's state. "Issue #100 on that repo
  is closed with a comment citing the scheduler runs" beats "check tidy-issues works". Only where no
  automatic check can exist may `Verify:` name a person's step, spelled out exactly.
- **`Blocked-by:`/`Not-before:`** are the queue's own wait fields: adoption holds the run until
  the PR has closed **and** the moment has passed. Aim `Not-before:` just past the release you
  expect — the re-arm covers a miss, so don't pad it.
- **`Retry-every:`** is the extension you are prescribing: when the run finds the change not
  yet live, it pushes `Not-before:` forward by exactly this much. Size it to the release you
  wait on — a nightly converge retries daily, a next-session rule in minutes.

Then the labels, as `/do-later` applies them: **`claude-task`** (the mark the scheduler run adopts) and
**`claude-model:sonnet`** (reading a live artifact and judging an assertion against it). Never
`claude-automerge` — a verification has nothing to merge. If `claude-task` doesn't exist in the
repo yet, say so and leave the issue — the labels appear on the next scheduler run.

## Tell the run how to converge

End the body with instructions to the run itself — the issue is its whole brief, and the run
decides nothing: it executes this playbook.

1. Read `In-production-when:` against the real artifact. Never infer it from a merge, a green
   run, or elapsed time.
2. **Live** → run `Verify:`. Passes: comment the evidence actually read (the version, the value,
   the URL) and close this issue as completed. Fails: reopen `Original-issue:` with a comment
   saying what was asserted, what happened instead and where you read it; comment here linking
   that; close this issue as completed — the verification did its job by finding the fault.
3. **Not yet live** → push `Not-before:` forward by `Retry-every:`, re-apply `claude-task` and
   `claude-model:sonnet`, and leave the issue open — the next scheduler run re-adopts it. No comment;
   the bumped field is the record.

## Then say what you filed

One line back to the owner: the issue link, what it waits on, and its retry cadence.

# Session continuity

Resumability for a long-running project worked across many sessions and machines — declare it for
any such project, research or not.

## Continuity across sessions


The owner works across many sessions and machines. Every session should end in a
**resumable** state.

- **Commit and push** finished units of work; leave the project runnable from a
  clean checkout.
- **Maintain a session warm-up doc** (the "read this first" map): what the project
  is, how to run it, where the tuned parameters and the deep rationale live, and
  the current numbers. It should let a new session skip re-reading the whole
  codebase.
- **Maintain a continuation guide**: where things stand, exact run commands, the
  tuned parameters and *why they exist*, and the open items. Keep the headline
  metrics current in it.
- **When the owner asks for a different way to do something, capture the new way
  durably — don't just do it this once.** A correction to *how* work is done (how
  results are shown, what command to run, a naming/format convention, a step to
  always take or skip) is a standing preference, not a one-off. Fold it into the
  warm-up doc — or a reference doc linked from it — so the next session reaches
  the same state without being told again. Prefer editing the doc that already
  owns that topic over adding a stray note; if the change contradicts what's
  written, replace it and say what changed. The test: *could a fresh session, with
  only the warm-up doc, reproduce this new behaviour?* If not, it isn't captured
  yet.
- Follow the repo's **branch/commit/PR conventions**: develop on the named
  branch, commit with clear messages, push; don't open a PR unless asked.

---

## 2026-09-15 · born · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Reason:** the method lived inside `rule-revalidation`'s own `task.md`, so the canon-side twin
  had nothing to load; a skill states the action and names no corpus.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the revalidating-rules skill, body workflow, reached by its description.
- **Landed:** #2047 (Closes #2044).

## 2026-09-25 · reworded · the empty-file fill no longer claims to backfill a member's local pack
- **Reason:** the run fills only files its claims lead it to, so judgment rules never fill that way;
  members are backfilled by hand.
- **Actor:** @missingbulb (owner), who declined a backfill task for the members that predate
  provenance.

## 2026-09-25 · trigger-changed · hidden from the model, description cut to 30 words
- **Reason:** only a task's worker or a person's `/name` reaches this skill, yet its description sat
  in every session's context.
- **Mechanism:** the harness's `disable-model-invocation: true`; the worker reads the SKILL.md by
  path.
- **Actor:** @missingbulb (owner).

## 2026-08-01 · born · Growth extract: one task over both sources, driven by skills; prose-to-checks sweep goes weekly (#622)
- **Reason:** same split - the conversation half's own method, invocable in-session.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the extract-from-conversations skill, body workflow, reached by its description.
- **Landed:** #622 (Closes #621).

## 2026-08-18 · scope-changed · growth-extract: split the retention prune out as its own agentless task (#992)
- **Reason:** the reading window becomes the last 24 hours plus the first 24 still on the branch, so
  age alone is safe: a capture reaches retention having been read.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the skill reads two sets each run - the last 24 hours, and the first 24 hours still
  on the branch - so the prune needs no agent to tell it a capture was read.
- **Landed:** #992 (Closes #964).

## 2026-09-25 · trigger-changed · hidden from the model, description cut to 30 words
- **Reason:** only a task's worker or a person's `/name` reaches this skill, yet its description sat
  in every session's context.
- **Mechanism:** the harness's `disable-model-invocation: true`; the worker reads the SKILL.md by
  path.
- **Actor:** @missingbulb (owner).

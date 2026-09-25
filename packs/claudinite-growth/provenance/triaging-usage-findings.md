## 2026-09-21 · born · the method a triage run follows, corpus-free (#2214)
- **Source:** docs/usage-review/DESIGN.md §6.4, the owner's design of 2026-09-21.
- **Reason:** the same triage runs over a canon's shelf and over a member's own local packs, and a
  skill states the method while naming no corpus - which is what lets one method serve two tasks
  in two packs without either depending on the other.
- **Mechanism:** a skill rather than prose in either task, because the order it fixes is a procedure
  with decision points (read provenance, work the causes, write only where one is settled) and is
  wanted only while a triage is under way. Provenance comes first in that order because `Rejected`
  and `Mechanism` can make a proposal one the owner has already refused.
- **Retire when:** the triage tasks stop opening proposals, or the order it fixes turns out not to
  change what a run does.
- **Landed:** #2214

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · trigger-changed · hidden from the model, description cut to 30 words
- **Reason:** only a task's worker or a person's `/name` reaches this skill, yet its description sat
  in every session's context.
- **Mechanism:** the harness's `disable-model-invocation: true`; the worker reads the SKILL.md by
  path.
- **Actor:** @missingbulb (owner).

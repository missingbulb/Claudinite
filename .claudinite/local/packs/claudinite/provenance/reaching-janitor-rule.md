## 2026-09-06 · born · converted from references.md (RULES-76)
- **Reason:** Owner ruling, 2026-09-06 (#1835): *"We need to establish something very important on
  the janitor: it is a fallback. A Cleanup. A thing we use to fix things that went wrong. It is not
  a part of a healthy flow of tasks."* Retire the rule if the janitor is ever given a stage of the
  ordinary path — nothing in the current nine rules is one.
- **Mechanism:** prose

## 2026-09-22 · reworded · the lane it names is a phase of the scheduler run now
- **Reason:** the rule named the janitor, which no longer exists: its rules run as the repair phase
  of the scheduler run. The discipline is unchanged and deliberately so - repair is still the
  fallback lane, no healthy path may depend on a rule there, and a park a person closed is answered
  - so only the carrier's name moved. The marker stays as it was, since the rule's history is one.
- **Actor:** @missingbulb (owner), who asked for the merge.
- **Model:** claude-opus-5
- **Landed:** #2262

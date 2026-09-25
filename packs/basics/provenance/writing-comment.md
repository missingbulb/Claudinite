## 2026-08-06 · born · Add comment rule: describe current state, not change history (#659)
- **Reason:** a comment about what was removed or renamed describes a version of the file the reader
  cannot see; the diff and the commit message already keep that, accurately and without maintenance.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, in the engineering-practices skill.
- **Landed:** #659.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Writing a comment".
- **Landed:** #760, closing #759 · pack version 1.

## 2026-09-25 · reworded · the owner replaced the rule with six explicit prohibitions
- **Reason:** the owner set the list directly; it forbids restating code, explaining a callee's
  workings or return, narrating history, naming paths, and comments an unrelated change would stale.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5

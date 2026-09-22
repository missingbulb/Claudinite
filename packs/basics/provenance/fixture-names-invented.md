## 2026-09-22 · born · a rename was landing as an edit of tests that were never about it
- **Source:** the owner, on the Claudinite-specific half of this rule: "add the general version of
  this to the testing rules - a test should declare fake examples when irrelevant to avoid
  confusing/conflicting with the real world or churn edits when the world changes."
- **Reason:** in the canon's own corpus a case that needed "some declared pack" reached for a real
  one, and 1 277 such literals stood across 150 test files. Two costs, not one: the borrowed name
  reads to a later reader as if the case were about that entity, and every rename of it arrives as a
  diff across tests that assert nothing about it.
- **Actor:** @missingbulb (owner).
- **Model:** Opus 5
- **Mechanism:** prose on the testing skill rather than a check, because the general form is not
  decidable outside a repo that has a registry of its own entities to compare a name against. Where
  a repo does have one - the canon's pack, task, skill and check names - it can carry its own check,
  as `test-fixtures-use-fake-entities` does in the canon home's local pack.
- **Retire when:** a mechanism can tell a borrowed name from an invented one without a per-repo
  registry, or the two costs stop showing up in real corpora.
- **Landed:** #2241

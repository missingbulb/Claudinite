## 2026-09-15 · born · converted from references.md (writing-tests-11)
- **Reason:** *Pragmatic Unit Testing*'s Right-BICEP, whose **E** is "can you force error conditions
  to happen", and its CORRECT boundary list (Existence, Conformance). Measured rather than assumed:
  instrumenting `task-contract.mjs` and `pack-registry.mjs` to record which rejection branches fire
  across all 3,666 tests gave 40 rejections, 32 fired, 8 never — the same fifth in each module
  independently. Of `task-contract`'s four, one (`code_work` present but empty) was a real gap whose
  own test already covered absent, valid, absolute and traversal; one (`model_from_request` not
  `true`) likewise; and one (`a "fresh_pr" task declares no "automerge"`) proved **unreachable**,
  since `validateTaskDeclaration` normalizes first and normalization always fills the field —
  which is why the rule says a never-forced branch is worth finding either way. `pack-registry`'s
  four were all present-but-unusable: an unreadable skills directory, a check module that throws on
  import.
- **Mechanism:** prose, a guideline of the writing-tests skill
- **Retire when:** Retire the rule if branch coverage becomes part of the suite's own reporting,
  which would surface these without an audit.

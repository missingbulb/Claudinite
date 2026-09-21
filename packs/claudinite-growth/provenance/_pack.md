## 2026-09-21 · born · the pack ships a rule file the review evaluates (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21.
- **Reason:** the thresholds the usage review judges by are the part a person must be able to review
  in a sitting, so they are data the pack ships rather than code it runs - one file, each rule
  readable as a sentence, pointed at a schema so `schema-conformance` validates it for free. A local
  pack may add its own in the same vocabulary.
- **Mechanism:** `usage-rules.json` beside the pack's prose, with `usage-rules.schema.json` beside
  it. Each rule in it is an element of this pack in its own right and carries its own provenance
  file, so a threshold's reasoning is recorded where a future review reads it and a rule whose
  proposals keep being declined is visible as one cited by `_declined.md` and by nothing else.
- **Landed:** #2214

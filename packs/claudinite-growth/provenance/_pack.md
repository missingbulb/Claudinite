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

## 2026-09-21 · reworded · a skill declares how it is reached, never how often (#2214)
- **Source:** the owner, declining a skill that predicts its own usage.
- **Reason:** the vocabulary was `adoption | routine | triggered | rare`, and two of those were
  frequency claims an author had to guess at. `routine` carried a stated rate, which one rule
  divided by; `rare` claimed "seldom" and no rule could test it. Both are now `judgment`, and the
  three surviving values each name a MECHANISM the record can contradict: loaded while its pack is
  adopted, loaded by its own force-load declarations, or loaded when the model judges its
  description fits. A guess cannot be wrong in a way a counter detects, so a rule built on one
  measures the author rather than the skill.
- **Rejected:** keeping `rare` beside `judgment` - with no rate, both meant "zero says nothing,
  never a finding", and two spellings of one state is what the declared-field rule forbids.
- **Retire when:** a value in the set stops being contradictable by the record.
- **Landed:** #2214

## 2026-09-22 · reworded · the manifest header keeps what the pack is, and nothing else (#2169)
- **Reason:** the header carried the pack's decisions rather than its shape - why the two extraction
  halves are one task (#622), why retention is a task of its own (#992), why an unset retention
  takes a default (#1620, #1621), why the task contract lives here and not in claudinite-lifecycle
  (#1029), why the corpus is the repo's own local packs by construction (#2047), and why
  seeding-by-default with removal as the opt-out is the enrolment mechanism (#242). Each now reads
  from the file of the element it decided about; a reader of the code needs only what the pack is
  and what it does not own. The README loses the same class of sentence.
- **Actor:** @missingbulb (owner), through the provenance backfill.
- **Model:** Claude Opus 5

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

---
name: write-an-iteration-note
description: Recording an accepted algorithmic change as a numbered iteration note in the method-narrative doc — what was wrong, what changed, the metric delta, what was tried and rejected. Use when recording an accepted change or closing an improvement iteration.
---

# Write an iteration note

Each accepted change is recorded as a **numbered iteration note** (pick a short
tag and stick to it, e.g. `R1, R2, …`) in a running method-narrative doc, so
**the next session does not re-derive what this one already learned.**

An iteration note captures:
- **What was wrong** (the observed failure, ideally with the diagnostic that
  showed it).
- **What changed** (the rule/parameter and why, in scale-free terms where
  possible).
- **The metric delta** — before/after, per input, on the real scoring harness.
- **What you tried and rejected, and why** — this is what stops the next session
  (or the next model) from walking back into the same dead end.

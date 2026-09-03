---
name: add-an-external-corpus
description: Growing the sample corpus from outside public sources — ranking candidates by fit, a committed repeatable fetch script, the full-ground-truth versus aggregate-label validation tiers, and measuring the regime gap. Use when adding a dataset or fetching more sample data from public sources.
---

# Add an external corpus

- **Grow the corpus from public sources that match the input regime.** Curate and
  **rank candidates by fit** = modality match × ground-truth availability × ease
  of access, and record licence and provenance for each.
- **Make ingestion a committed, repeatable fetch script**, not a manual download,
  so anyone can reproduce the corpus.
- **Respect the two validation tiers — and don't mix them:**
  - **Full ground truth** (per-item annotations) → scores the *algorithm's
    detailed output* (overlap / detection) on the real harness.
  - **Aggregate label only** (a published summary number, no per-item
    annotation) → validates the *summary quantity* the project reports, and
    nothing finer.
  Wiring an aggregate-only dataset into the detailed-overlap harness would force
  you to **fabricate annotations**, which violates the rule that ground truth is
  annotated, never fabricated. Keep a separate, mask-free validation path for
  those sets.
- **External data is rarely drop-in.** Expect a scale/regime gap (the learning
  set's stated input format and target regime) and *measure* it with the
  appropriate tier rather than assuming the corpus is covered.

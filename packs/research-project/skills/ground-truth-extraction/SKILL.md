---
name: ground-truth-extraction
description: Deriving machine-usable ground truth from the owner's hand annotations — source versus generated artifact, deterministic self-checking extraction, auto-detected annotation conventions, and verifying the parse before scoring. Use when adding a dataset, writing or changing an extraction script, or fixing ground truth.
---

# Ground-truth extraction

- **Separate source-of-truth from generated artifacts.** The hand-annotation is
  the source; the machine-usable ground-truth (registered masks, parsed labels,
  normalized tables) is **generated from it and regenerated on demand** — never
  hand-edited, because the generator overwrites it. To fix ground truth, **fix
  the source annotation (or the extraction code) and regenerate**, then re-score.
- **Make extraction deterministic and self-checking.** Same annotation → same
  derived ground truth. Pin the things a human counted (number of objects,
  number of regions) as assertions/tests so a silent extraction regression fails
  loudly.
- **Auto-detect annotation conventions from the data**, don't hard-code a
  per-input flag. When the owner uses more than one annotation scheme over time,
  detect which scheme an input uses from the ink/markup itself. Record the
  **conventions** (what each colour / mark / region means) in a durable doc; they
  are requirements, not incidental.
- **Verify the annotation actually parses before trusting a score.** Inspect two
  things: did the markup parse into the labels you expected, and did the derived
  ground truth land correctly on the raw input (registration / alignment)? Keep
  the review overlays.

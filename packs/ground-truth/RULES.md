# Ground truth & dataset discipline

The dataset half of a scored-algorithm research project (declare alongside `research-iteration`):
where the ground truth comes from, why the learning set is both a feature and a hazard, and the
anti-overfitting rules that keep a small-set project honest.

## Ground truth — user-provided, annotated, **never invented**


- **The owner's annotations are the ground truth.** Every change is validated by
  agreement against them, not against your own expectation of the answer.
- **Ground truth is annotated, never fabricated.** Do not invent labels to make a
  dataset scorable. If a dataset lacks the annotation a given harness needs, it
  does not go into that harness (see §9 on validation tiers).
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

---

## Inputs — a small, similarly-formatted learning set


- Projects like this begin with a **small learning set of similarly-formatted
  inputs** (same modality, same acquisition regime, same annotation convention).
  That is a feature — it lets you iterate fast and look closely — and a hazard:
  it is small enough to overfit (§4).
- **State the input format explicitly** (dimensions, modality, contrast
  convention, expected content per input) so a mismatched new input is diagnosed
  fast. Keep a one-line-per-input table.
- **Name the primary target regime and what is out of scope.** A different
  regime (inverted contrast, far denser or sparser content, a different scale)
  is a *transfer* problem, not the main path — treat it as such until explicitly
  in scope.
- **Scale-awareness is a first-class concern.** An algorithm tuned for one
  input scale (e.g. a zoomed view of a few objects) often fails on another
  (a wide field of many). Know which regime you are tuned for, and measure the
  gap on the other rather than pretending it's covered.

---

## Do not overfit the learning set


This is the discipline that keeps a small-set project honest. These are **hard
constraints** — a change that violates one gets reverted even if it improves a
metric.

- **No single-input special-casing.** Every rule must generalise across the set.
  If a fix only helps one input, say so and either generalise it or drop it.
  Never key logic on a specific input's identity/filename.
- **Keep decision rules free of the very prior you are trying to measure.** If
  the project measures quantity *X*, no rule may bake in an assumed value of *X*
  (that turns the measurement into an assumption). Prefer rules expressed in
  terms the input **measures for itself** over fixed constants.
- **Prefer scale-free rules over pixel/absolute constants.** Where a constant is
  unavoidably tied to the current data's scale/resolution, **isolate and label
  it** as scale-dependent so it is the first thing revisited on new-scale data.
- **Name the hard constraint the task cannot trade away**, and tune to it first.
  Some projects have a metric that is non-negotiable (e.g. a failure mode whose
  cost dominates all others); identify yours, hold it at its required level
  *first*, and optimise the softer metrics only underneath it. Make it explicit
  so a later tuning pass doesn't quietly trade it away.
- **Keep a registry of domain assumptions, each with a failure mode.** Choices
  that encode a prior about the *subject or the instrument* (not pure
  processing) are named, located in the code with an inline tag, and given an
  explicit "how it fails on mismatched data" note. When a new input looks wrong,
  the first diagnostic is *"which assumption did this input break?"* — and that is
  only fast if the assumptions are written down. Flag the thinly-supported ones
  (e.g. calibrated on a single example) honestly.
- **Guard the wins with regression tests.** An input the owner has blessed as
  "very good" must not silently regress when you tune for another. Pin its score.

---

## Fetching more sample data from the outside


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
  you to **fabricate annotations**, which violates §2 ("ground truth is annotated,
  never invented"). Keep a separate, mask-free validation path for those sets.
- **External data is rarely drop-in.** Expect a scale/regime gap (§3) and
  *measure* it with the appropriate tier rather than assuming the corpus is
  covered.

---

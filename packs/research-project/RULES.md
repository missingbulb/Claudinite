# research-project — running an algorithm against ground truth

## 1. The core loop — iterate on the algorithm, and *show* every step

For every substantive algorithmic change, in this order:

1. **Reproduce & diagnose — visually, first.** Start from the actual inputs.
   Render the current behaviour and *look* at it before theorising. If a
   decision hinges on a measurable fact (a colour/intensity split, a threshold,
   an over-reach, a distribution), write a **throwaway diagnostic and measure
   it** — do not guess.
2. **Prototype in the scratchpad.** Build the change as a standalone script
   first. Do **not** touch tracked code yet.
3. **Show a comparison in the chat.** Surface a rendered **[ original | result ]**
   side-by-side — and **[ … | ground truth ]** wherever scoring applies —
   directly in the conversation (render it inline, don't just link a path). The
   **picture leads**; numbers (accuracy metrics, the target quantity) come
   *after* it as confirmation, **never instead of it**.
4. **Get a read, then commit to the approach.** Only once the visual result is
   right do you wire it into the tracked code. If a call is genuinely ambiguous
   or is the owner's to make, ask **one** targeted question; otherwise proceed on
   a sensible default and state what you chose.
5. **Wire it in fully** — see *Definition of done* (§5).
6. **Record it** as a numbered iteration note — what was wrong, what changed, the
   metric delta, and **what you tried and rejected** (the `write-an-iteration-note` skill).

### Show, don't just tell
- Every algorithmic change is presented as a rendered comparison against the
  original, and against ground truth when scoring is involved. Prefer a clean,
  purpose-built **results figure** over a wall of metrics.
- The presentation render is usually **not** the debug overlay. Favour a thin,
  semi-transparent style that keeps the underlying data readable (thin lines,
  mostly-transparent fills), and give a matched object the **same colour in the
  result and the ground-truth panels** so over-/under-reach is obvious at a
  glance. Tag objects with small ids that key into the metrics table.
- **Never draw an annotation in a colour the underlying signal itself carries.**
  A mark in the signal's own colour disappears exactly on the objects it exists
  to mark, so the figure looks cleanest where the method is least verified. Pick
  the overlay palette against the data's own colours (and keep the choice
  guarded, if the render is scripted), not by aesthetic preference.
- **Show where the method breaks, not only where it works.** The overlay is a QA
  tool before it is a result: point at the misses, the fragmentation, the cases
  handled badly, and make each claim explicit and checkable ("this outline is
  what I'm counting as an object; that one has no outline — it was missed") so
  the owner can disagree with a specific claim rather than a general impression.
- **Say which of the numbers you just reported are trustworthy, where you report
  them.** Every quantity a project reports sits somewhere on a spectrum from
  "measured and validated" to "indicative at best" — a quantity derived from a
  low-resolution crop, one still inflated by a known failure mode, a split that
  rests on a single threshold. State that boundary *inline, beside the number*,
  not in a separate caveats section a reader meets after they have already
  written the number down. A number quoted without its caveat is read as
  trustworthy.
- Throwaway renders and diagnostics live in the scratchpad; only the **final
  artifact and the code that regenerates it** get committed.

### Interaction cadence
- **Keep the owner in the loop with pictures**, proactively, and ask a question only when a
  decision is genuinely theirs or the request is ambiguous — never to confirm work you can
  verify yourself.
- **Finishing a unit of work** — leave it committed and pushed, so it can be reviewed or
  resumed from a fresh session.

---

## 2. Ground truth — user-provided, annotated, **never invented**

- **The owner's annotations are the ground truth.** Every change is validated by
  agreement against them, not against your own expectation of the answer.
- **Ground truth is annotated, never fabricated.** Do not invent labels to make a
  dataset scorable. If a dataset lacks the annotation a given harness needs, it
  does not go into that harness (the `add-an-external-corpus` skill owns the validation tiers).
---

## 3. Inputs — a small, similarly-formatted learning set

- Projects like this begin with a **small learning set of similarly-formatted
  inputs** (same modality, same acquisition regime, same annotation convention).
  That is a hazard as well as a feature: it is small enough to overfit (§4).
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

## 4. Do not overfit the learning set

These are **hard constraints** — a change that violates one gets reverted even
if it improves a metric.

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
- **Name the hard constraint the task cannot trade away**, and tune to it first —
  some projects have a metric whose cost dominates all others; hold it at its
  required level before optimising the softer metrics underneath it. Make it
  explicit so a later tuning pass doesn't quietly trade it away.
- **Keep a registry of domain assumptions, each with a failure mode.** Choices
  that encode a prior about the *subject or the instrument* (not pure
  processing) are named, located in the code with an inline tag, and given an
  explicit "how it fails on mismatched data" note. When a new input looks wrong,
  the first diagnostic is *"which assumption did this input break?"*. Flag the
  thinly-supported ones (e.g. calibrated on a single example) honestly.
- **Guard the wins with regression tests.** An input the owner has blessed as
  "very good" must not silently regress when you tune for another. Pin its score.

---

## 5. Repeatable improvement iterations — *definition of done*

### Definition of done for an accepted change
- **Source updated — never the generated artifacts.** (Regenerate them.)
- **Artifacts regenerated** with the committed generators.
- **Tests green**, and the **scoring deltas reported** (per input, per metric).
- **Committed with a clear message and pushed**, so the work is reviewable and
  resumable from a fresh session / another machine.
- **Learnings cached**: the iteration note (the `write-an-iteration-note` skill), plus a
  pointer/update in the session warm-up doc or the relevant reference doc **if the map or
  procedure changed**.

---

## 6. Research phases, and spikes vs the main path

- **Separate work into explicit phases**, each with a bounded deliverable, and
  say which phase a piece of work belongs to. Defer the hard/advanced piece
  explicitly rather than half-building it — e.g. get an intermediate output
  trusted before building the final quantity that depends on it.
- **Distinguish research spikes from the maintained pipeline.** Exploratory
  scripts are worth keeping for reference, but the repo map must make clear what
  "the pipeline" actually is versus what was an older spike, so a new session
  doesn't mistake a dead branch for the main path.
- **Keep a "known open items" / deferred list** so the boundary between "done",
  "deferred by choice", and "not yet attempted" is never ambiguous.

---

## 10. Environment limitations — stay lightweight

- **A fresh container has nothing installed.** Assume dependencies must be
  installed each session, and keep the dependency set **small and lightweight** —
  favour a compact set of core libraries over heavy frameworks (e.g. large ML
  stacks) that are slow to install and awkward to run anywhere.
- **When a heavy or learned approach is genuinely the right tool, treat it as a
  gated, isolated route** (documented, opt-in, scoped to the cases that need it)
  rather than a new baseline dependency — and prove the lightweight route is
  exhausted first.
- **Route around missing system binaries with libraries** (the `source-intake` skill). Document the
  exact install lines and any "install ad hoc, not in requirements" tools in the
  warm-up doc.

---

## 11. Getting — and evaluating — algorithm ideas from the owner

The owner will suggest algorithms and directions to try next. Treat these as
first-class experiments:

- **Take the suggestion seriously even when the project has declared a direction
  "exhausted."** A suggestion may belong to a *different family* than everything
  tried so far, which is exactly when it can break a wall the previous family
  couldn't.
- **Evaluate it the same way as any change**: diagnose the wall it targets, build
  the evidence that the wall is real (or isn't), prototype, and show a comparison.
- **Beat the naive baseline, or drop it.** A more sophisticated or signal-driven
  method is only worth adopting if it *measurably* out-scores the simple/uniform
  baseline — sophistication is not accuracy when the guiding signal is noisy or
  penetrates the structure unevenly. Keep the roles of a signal distinct, too: a
  feature that is excellent for *visualising or validating* a structure can be
  wrong for *defining* it — gating the output directly on such a signal can erode
  the very structure you are measuring. (1)
- **Document the outcome fully**, including the routes that hit a wall and *why*
  (name the specific trade-off or signal that defeated them). If the idea needs
  capabilities the environment won't allow (§10), record the concrete route to
  try when that changes, so the thread is resumable rather than lost.
- **Complementary routes are not competitors.** Two methods can attack the same
  problem from different angles; keep both documented and say how they relate.

---

## 12. Record cross-domain applicability **out-of-band**

When a sub-step of the algorithm plausibly applies to **another problem** beyond
the current task, record it as a **short pointer in a dedicated side document** —
a direction worth attention, not a validated claim. **Keep this speculation out
of the algorithm itself**: code and inline comments stay strictly about the task
at hand and its stated assumptions. Add an entry whenever you build or
substantially change a sub-step.

---

## 13. Continuity across sessions

The owner works across many sessions and machines. Every session should end in a
**resumable** state.

- **Commit and push** finished units of work; leave the project runnable from a
  clean checkout.
- **Maintain a session warm-up doc** (the "read this first" map): what the project
  is, how to run it, where the tuned parameters and the deep rationale live, and
  the current numbers. It should let a new session skip re-reading the whole
  codebase.
- **Maintain a continuation guide**: where things stand, exact run commands, the
  tuned parameters and *why they exist*, and the open items. Keep the headline
  metrics current in it.
- **When the owner asks for a different way to do something, capture the new way
  durably — don't just do it this once.** A correction to *how* work is done (how
  results are shown, what command to run, a naming/format convention, a step to
  always take or skip) is a standing preference, not a one-off. Fold it into the
  warm-up doc — or a reference doc linked from it. Prefer editing the doc that
  already owns that topic over adding a stray note; if the change contradicts
  what's written, replace it and say what changed. The test: *could a fresh
  session, with only the warm-up doc, reproduce this new behaviour?* If not, it
  isn't captured yet.
- Follow the repo's **branch/commit/PR conventions**: develop on the named
  branch, commit with clear messages, push; don't open a PR unless asked.

# Research iteration — show the work, prove each change

The core methodology for the class of project this pack serves: **run an algorithm over a set
of similarly-formatted inputs, score it against user-provided ground truth, and improve it in
repeatable, reviewable iterations** (image analysis / CV is the archetype). Declare this pack
alongside `ground-truth` and `session-continuity` for a project of that class. The dataset and
anti-overfitting discipline live in the `ground-truth` pack; resumability lives in
`session-continuity`; reading reference papers and extracting figures is the
`reading-source-articles` skill.

The one non-negotiable is the spirit: **show the work visually, prove each change against ground
truth, never overfit the learning set, and leave the project resumable.**

## The core loop — iterate on the algorithm, and *show* every step


This is the cadence the owner wants, and it is the **deliverable style**, not
optional polish. Follow it for every substantive algorithmic change.

1. **Reproduce & diagnose — visually, first.** Start from the actual inputs.
   Render the current behaviour and *look* at it before theorising. If a
   decision hinges on a measurable fact (a colour/intensity split, a threshold,
   an over-reach, a distribution), write a **throwaway diagnostic and measure
   it** — do not guess. Cheap, disposable diagnostics beat argument.
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
   metric delta, and **what you tried and rejected** (§5).

### Show, don't just tell
- Every algorithmic change is presented as a rendered comparison against the
  original, and against ground truth when scoring is involved. Prefer a clean,
  purpose-built **results figure** over a wall of metrics.
- The presentation render is usually **not** the debug overlay. Favour a thin,
  semi-transparent style that keeps the underlying data readable (thin lines,
  mostly-transparent fills), and give a matched object the **same colour in the
  result and the ground-truth panels** so over-/under-reach is obvious at a
  glance. Tag objects with small ids that key into the metrics table.
- Throwaway renders and diagnostics live in the scratchpad; only the **final
  artifact and the code that regenerates it** get committed.

### Interaction cadence
Keep the owner in the loop with **pictures**, proactively. Ask a question only
when a decision is genuinely theirs or the request is ambiguous — not to confirm
work you can verify yourself. When you finish a unit of work, leave it committed
and pushed so it can be reviewed or resumed from a fresh session.

---

## Repeatable improvement iterations — the numbered notes, and *definition of done*


Each accepted change is recorded as a **numbered iteration note** (pick a short
tag and stick to it, e.g. `R1, R2, …`) in a running method-narrative doc. The
point is that **the next session does not re-derive what this one already
learned.**

An iteration note captures:
- **What was wrong** (the observed failure, ideally with the diagnostic that
  showed it).
- **What changed** (the rule/parameter and why, in scale-free terms where
  possible).
- **The metric delta** — before/after, per input, on the real scoring harness.
- **What you tried and rejected, and why.** Rejected approaches are as valuable
  as accepted ones; they stop the next session (or the next model) from walking
  back into the same dead end.

### Definition of done for an accepted change
- **Source updated — never the generated artifacts.** (Regenerate them.)
- **Artifacts regenerated** with the committed generators.
- **Tests green**, and the **scoring deltas reported** (per input, per metric).
- **Committed with a clear message and pushed**, so the work is reviewable and
  resumable from a fresh session / another machine.
- **Learnings cached**: the iteration note above, plus a pointer/update in the
  session warm-up doc or the relevant reference doc **if the map or procedure
  changed**.

---

## Research phases, and spikes vs the main path


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

## Environment limitations — stay lightweight


- **A fresh container has nothing installed.** Assume dependencies must be
  installed each session, and keep the dependency set **small and lightweight** —
  favour a compact set of core libraries over heavy frameworks (e.g. large ML
  stacks) that are slow to install and awkward to run anywhere. Prefer a
  lightweight solution that installs in seconds and runs anywhere.
- **When a heavy or learned approach is genuinely the right tool, treat it as a
  gated, isolated route** (documented, opt-in, scoped to the cases that need it)
  rather than a new baseline dependency — and prove the lightweight route is
  exhausted first.
- **Route around missing system binaries with libraries** (see §8). Document the
  exact install lines and any "install ad hoc, not in requirements" tools in the
  warm-up doc.

---

## Getting — and evaluating — algorithm ideas from the owner


The owner will suggest algorithms and directions to try next. Treat these as
first-class experiments:

- **Take the suggestion seriously even when the project has declared a direction
  "exhausted."** A suggestion may belong to a *different family* than everything
  tried so far, which is exactly when it can break a wall the previous family
  couldn't. "We already tried X" rarely covers a genuinely different approach.
- **Evaluate it the same way as any change**: diagnose the wall it targets, build
  the evidence that the wall is real (or isn't), prototype, and show a comparison.
- **Document the outcome fully**, including the routes that hit a wall and *why*
  (name the specific trade-off or signal that defeated them). If the idea needs
  capabilities the environment won't allow (§10), record the concrete route to
  try when that changes, so the thread is resumable rather than lost.
- **Complementary routes are not competitors.** Two methods can attack the same
  problem from different angles; keep both documented and say how they relate.

---

## Record cross-domain applicability **out-of-band**


When a sub-step of the algorithm plausibly applies to **another problem** beyond
the current task, record it as a **short pointer in a dedicated side document** —
a direction worth attention, not a validated claim, and it need not be certain to
be worth noting. **Keep this speculation out of the algorithm itself**: code and
inline comments stay strictly about the task at hand and its stated assumptions.
This keeps the core legible and honest about what it is *for* while not losing
genuinely useful observations that surface while building it. Add an entry
whenever you build or substantially change a sub-step.

---

## Improving this playbook from a past session

Some process preferences live only in the dialogue of earlier sessions. To fold them into these
packs, use the `lessons-learned` skill — mine the conversation for durable, project-agnostic
working-style preferences (how results are shown, ground-truth conventions, anti-overfitting
rules, environment constraints) and propose them as edits to the owning pack, showing a diff
before committing. Do not continue the research task itself during such a pass.

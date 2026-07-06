---
name: prose-to-checks
description: Mine the corpus's existing prose (pack RULES.md, skill SKILL.md) for always-testable rules that were never converted to checks, and convert the strongest ones. Use when auditing the corpus for convertible rules, or when the nightly growth routine runs its prose-to-checks sweep.
---

# Convert existing prose to checks

A completeness-critic over Claudinite itself. The growth *promote* phase converts each **new**
lesson down the promotion ladder; this pass sweeps the **existing** prose backlog for rules that
are always-testable but still live only as prose — and converts them, so the corpus keeps
shedding context over time instead of only at the moment a rule is first learned.

## What to look for — the check-the-world test

Read the prose of the packs and skills (`packs/<name>/RULES.md`, `packs/<name>/RELEASE.md`,
`skills/<name>/SKILL.md`). For each rule, ask the one question from
[checks/DESIGN.md](../../checks/DESIGN.md): **does it constrain a *static signature in the repo
artifact* — something a post-hoc scan could observe?**

- **Yes → a conversion candidate.** A dangling-reference rule, a filename convention, a workflow
  or manifest shape, a "these two files must agree" invariant, a forbidden pattern in code.
- **No → leave it.** In-flight process (leaves no artifact — "see the test fail first"),
  judgment ("name by scope"), or knowledge whose failure is only visible at runtime (jsdom
  diverging from Chrome). These are why the rule is prose; don't force them.

The check-the-world rule from DESIGN holds: if a rule is always-testable, it was never really
part of the on-demand skill — it belongs in a pack as a check.

## How to convert one

Follow the promote phase's check-authoring discipline
([growth/promote.md](../../growth/promote.md) and
[growth/item-routing.md](../../growth/item-routing.md) own the ladder). For each candidate:

1. **Author the check** in the owning pack (`packs/<pack>/<rule>.mjs`, listed in `pack.mjs`) —
   the failure message *is* the rule (what / why / fix / `doc:` pointer back to the prose).
2. **Write the fixture first and see it fail** — a violating fixture must find, a clean one must
   not (`checks/test/`). A conversion with no proving fixture doesn't ship.
3. **Ship at real severity, fail-fast** — blocking for a defect, advisory only when the rule is
   directional by kind.
4. **Trim the prose** to rationale — the check owns enforcement now; leaving both pays twice and
   springs the drift trap.

**Before rejecting a candidate as false-positive-prone, ask whether a small *scoped structural
parser* removes the FP that a text-grep can't.** A regex sees text presence; the false positive
is usually that the pattern appears in a place the rule doesn't mean. Parsing just enough
structure to scope the match to where it counts often converts a "reject" into a clean check —
navigate the artifact's structure, not its bytes. (The two SAM YAML checks needed a minimal
template parser: `Authorization` is only wrong *inside the OriginRequestPolicy's own headers*,
and the handler-subdir rule only applies with a single entry point and no `OutBase`.) Keep the
parser scoped to your need, not general — and it earns the same adversarial-fixture bar.

When even a scoped parser can't make detection confident, **leave the prose and log the
candidate** to a tagged conversion-backlog issue rather than shipping a shaky check.

## Bounds

- **One PR, bounded surface** — the new rule module, its `pack.mjs` line, its fixture, and the
  trimmed prose. Don't "improve" unrelated rules while you're in there.
- **Never delete a rule you didn't convert** — trimming prose is only for a rule a *landed* check
  now enforces.
- Run the suite and the sweep green before opening the PR; open it for the owner's approval,
  never a direct push to `main`.

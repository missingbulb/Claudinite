---
name: prose-to-checks
description: Mine pack prose (RULES.md, SKILL.md) for always-testable rules that were never converted to checks, and convert the strongest ones. Use when auditing packs for convertible rules, when the weekly prose-to-checks sweep runs, or as the upgrade pass over prose a growth-extract run just wrote.
---

# Convert existing prose to checks

A completeness-critic over a repo's own packs: prose that is always-testable but was never converted
becomes a check, so the packs keep shedding context over time instead of only at the moment a rule is
first learned.

## Two callers, differing only in scope

- **The upgrade pass**, as the last step of a
  [growth-extract](../../tasks/growth-extract/task.md) run: the scope is the prose **that run just
  wrote**. Extraction already descends the promotion ladder per lesson, but a lesson written as prose
  under time pressure is exactly where a convertible rule hides, so it gets asked once more before the
  PR opens. Never widen from here into the standing backlog.
- **The weekly [prose-to-checks-sweep](../../tasks/prose-to-checks-sweep/task.md)**: the scope is the
  **standing backlog** — everything under the pack paths configured for this repo, which the task
  passes in its Context. A consuming repo's own **local packs** (`.claudinite/local/packs/`) by
  default — projects don't improve core canon packs — while **Claudinite itself** also sweeps its core
  `packs/`. Read the prose under those paths (each pack's `RULES.md`, and any `SKILL.md` beside them).

Plus on demand, when someone asks. Either way: never edit a read-only mounted canon pack under
`.claudinite/shared/`. Everything below is identical for both callers.

## First gate — a working rule, not a product statement

Before asking whether a rule is *testable*, ask whether it belongs to a pack at all: **does it govern
how we work, or state what the product does?** A pack — canon or local — homes the conventions,
gotchas and review discipline that recur across tasks whatever the feature happens to be. A rule
asserting which entities exist, what a surface must render, or that a feature's parts are wired to
each other is a **requirement**; its home is the project's executable spec and the suite that proves
it (the full rule lives in
[generate-project-instructions](../generate-project-instructions/SKILL.md)).

This gate comes **first** because product statements sail through the check-the-world test below —
"this module must export `X`" has an obvious static signature. Converting one splits a feature's
definition across two systems and lands half of it in the one no test of the product ever reads.
Load-bearingness is not the test: a real gap in product coverage is a *requirements* gap.

A product statement already sitting in pack prose is mis-homed, and a sweep is not the place to
re-home it. **Leave the prose and log it** as a mis-homed rule, the same way an un-checkable
candidate is logged — never cement it as a check.

## What to look for — the check-the-world test

For each rule that cleared the gate, ask the one question from
[engine/checks/DESIGN.md](../../../../engine/checks/DESIGN.md): **does it constrain a *static
signature in the repo artifact* — something a post-hoc scan could observe?**

- **Yes → a conversion candidate.** A dangling-reference rule, a filename convention, a workflow
  or manifest shape, a "these two files must agree" invariant, a forbidden pattern in code.
- **No → leave it.** In-flight process (leaves no artifact — "see the test fail first"),
  judgment ("name by scope"), or knowledge whose failure is only visible at runtime (jsdom
  diverging from Chrome). These are why the rule is prose; don't force them.

**A static signature is necessary, not sufficient.** Both shapes the working-discipline rules bar
— a rule that pins today's code in place, and one derivable from the product's requirements —
answer *yes* here, so screen every candidate against that bar before converting it. Leave either
where it is; routing a requirement to the spec and its suite is its own change, not this sweep's.

The check-the-world rule from DESIGN holds: if a rule is always-testable, it was never really
part of the on-demand skill — it belongs in a pack as a check.

## How to convert one

Follow the extract stage's check-authoring discipline (the local promotion ladder in
[extracting-lessons.md](../../extracting-lessons.md)). For each candidate:

> **The upgrade-pass caller lands inside growth-extract's own PR**, which auto-merges after CI — so the
> see-it-fail fixture is the only gate a converted check gets there. Convert only what you can prove;
> anything shakier stays prose and waits for the weekly sweep's reviewed PR.

1. **Author the check** in the owning pack (`<pack>/<rule>.mjs`, listed in its `pack.mjs`) — the
   failure message *is* the rule (what / why / fix / `doc:` pointer back to the prose).
2. **Write the fixture first and see it fail** — a violating fixture must find, a clean one must
   not (the test lives beside the pack's other tests). A conversion with no proving fixture
   doesn't ship.
3. **Ship at real severity, fail-fast** — blocking for a defect, advisory only when the rule is
   directional by kind, or when the condition is real and blocking-grade but **irreversible by the
   time it is observable** (an append-only transcript, a published artifact). A blocking finding no
   edit can retract never converges: it spends every remaining Stop cycle on something nothing can
   fix. Advisory there is *diagnostic* — it names the cause the moment it appears, so the session
   doesn't re-derive it from an unexplained downstream failure.
4. **Delete the prose the check now covers** — whole, never trimmed. The deletion test below is
   how you decide which paragraphs those are.

**Before writing a rule off as un-checkable, try parsing the file's structure instead of grepping
its text.** Grep finds the pattern anywhere; parsing finds it in the one spot the rule means —
which kills the false alarm. (Example: `Authorization` is only wrong inside a CloudFront policy's
*own* header list, not elsewhere in the template.) Parse only as much as you need, and hold the
check to the same fixture bar.

When even a scoped parser can't make detection confident, **leave the prose and log the
candidate** to a tagged conversion-backlog issue rather than shipping a shaky check.

**A recorded "not statically checkable" verdict expires when the tree changes — re-derive it, don't
trust it.** Un-checkability is a judgment about the shape of the sources at the time, not a property
of the rule. A removal, a migration or a consolidation can collapse the entry points a check would
have had to cover and make yesterday's impossible detection trivial. When a sweep meets prose an
earlier sweep left behind, re-ask the objection against today's sources.

**Write the detection as a positive allowlist over an enumerated surface, not as a list of the bad
cases.** Match the one shape that *is* allowed and flag everything else — a ban list only covers the
routes whoever wrote it thought of, so a new API, a new spelling, or an indirection defeats it
silently, and the same reasoning that drew the list is blind to what it missed. Matching the allowed
case catches the case that doesn't exist yet, and turns indirection into a finding rather than an
escape. Invert this only where the allowed set is genuinely open-ended.

**When a rule mandates a *form*, the check asserts that form — never the intent behind it.** Where
the prose says *write it exactly like this*, the check's whole job is deciding whether the artifact
is that form; inferring what the author meant is unbounded in the wrong direction and leaves the
likeliest reproduction uncaught (a hand-picked marker list will always miss the phrasing nobody
enumerated). Expect a form check to fire on something that breaks the form while causing no harm —
that is the rule as written doing its job, not a reason to re-add intent-guessing.

**"Already covered by another check" is a claim to test, not to reason out.** Before dropping a
candidate as a duplicate, hand the sibling check a file that violates the rule and watch what it
does. A ban on one API is not a ban on the *capability*: the same thing is usually reachable through
a language built-in, a re-exported namespace, or a different import the sibling never listed. Three
consecutive sweeps can each re-derive the same wrong duplicate verdict from the same plausible
reasoning; running it costs a minute and is the only step that can disagree with you.

**Read the conversion tracker's prior comments before authoring a conversion, not after.** A
rejection recorded there is settled — a fresh reading of the same prose will happily re-nominate the
same rule, build it out in full, and only then discover it was built and rejected before. Independent
re-derivation is exactly how the duplicate work happens, so the tracker is a precondition of the
work, not a place to log it.

## Coming out: the deletion test

Coming out of a conversion, apply the **deletion test**: prose a mechanism fully covers is
deleted, never trimmed. Ask it of every paragraph standing beside a landed check — *with this
paragraph gone, would the check still catch every violation it describes **and** tell the agent
how to fix it?* If yes, it is redundant: delete it whole. The check's failure message is where
the rule lives now and its header comment is where the rationale lives, so a paragraph restating
either pays twice and is the drift trap waiting to spring.

Before concluding prose is the only carrier, look at the pack's **skills** too — an
activity-scoped skill often already holds the map a rule is repeating. Keep only what no artifact
carries.

The test **discriminates** rather than just deleting: a paragraph stays whole whenever it carries
something the check does not — a second rule in the same breath, an exemption the check can't
encode, a value the check can't judge, or a remedy the finding's own `fix` line never states
(a finding renders `what` / `why` / `fix` / `doc`, never the rule's `description`, so a remedy
that lives only in the description is not carried). Two worked calls: an `npm test` invariant
went entirely — the check caught it and the testing-guide skill already listed the suites —
while an `extension-test/` mirror bullet stayed, because the check beside it enforced only the
`package.json` list's sync with the tree and never the mirror convention itself.

Whether a check covers a rule is a judgment about meaning, so this test is applied by a
**reader**, not mechanized.

## Bounds

- **One PR, bounded surface** — the new rule module, its `pack.mjs` line, its fixture, and the
  trimmed prose. Don't "improve" unrelated rules while you're in there.
- **Never delete a rule you didn't convert** — the deletion test is only ever asked of a rule a
  *landed* check now enforces.
- Run the suite and the sweep green before the PR goes up, and never push to `main` directly. The
  sweep opens its own PR for the owner's approval; the upgrade pass adds its conversion to the
  growth-extract PR already being opened, and opens none of its own.

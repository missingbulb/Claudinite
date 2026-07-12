# Growth — discover packs (stage 2 of pack discovery, central)

**Stage 2 of pack discovery**, run **once, centrally, from the Claudinite home repo** — not per project.
Where [stage 1](stack-manifest.md) makes each repo's stack *visible* (a converged "Stack manifest"
issue) and decides nothing, this stage reads those manifests across the fleet and, for a technology no
pack yet owns, **authors a populated pack** — real rules and checks distilled from the fleet's actual
usage. It is Claudinite-internal; consuming repos don't vendor or `@import` it.

The owner's directive is the shape of this stage: **don't just open a stub and wait for good news.**
When an unhomed technology first appears, go and extract its portable rules — the pack arrives with
content, not a placeholder.

## The governing principle — distilled from worked examples, never from imagination

The corpus rule that a pack is *distilled from worked examples, not written from imagination* is not in
tension with authoring a pack here — it's the constraint that makes it safe. **The repos actually using
the technology are the worked examples.** This stage reads how they really configure, build, sign, and
ship it, and the gotchas already captured in their docs, and distills rules from *that*. So:

- **Ground every rule in observed usage, and cite it.** A rule must trace to how the fleet actually uses
  the technology — the real build config, the real packaging/signing step, a gotcha a project already
  hit. This is distillation, not invention.
- **Never pad.** Do not fill the pack with speculative best-practice rules the fleet doesn't demonstrate.
  A rule you can't ground in the evidence, you don't write. A smaller honest pack beats a padded one —
  the same bar [promote](promote.md) holds for a single lesson, applied to a whole pack.
- **An empty seed is the rare fallback, not the goal.** A technology genuinely exercised almost always
  yields *something* distillable — at minimum its fingerprint plus its build/deploy mechanics. Fall back
  to a near-empty `RULES.md` only when it truly doesn't yet, and say so in the pack's README.

## The authoring method is generate-project-instructions'

Do **not** re-derive how to write a pack. [The generate-project-instructions skill](../skills/generate-project-instructions/SKILL.md)
owns the method — facet decomposition, the portability strip, the promotion-ladder gate, and the
four-file pack shape with its acid tests — and this stage applies it to **one technology facet, with the
fleet as the evidence pool**. This stage owns only what that skill doesn't: finding the unhomed
technologies across the manifests, the first-sight trigger, and central delivery. Everything about
*how the pack reads* defers to that skill (including its acid test: a reader must not be able to tell
which project it was extracted from).

## Run on a capable model

Every step is heavy judgment — is the technology genuinely unhomed, which usage is a portable rule vs.
a project's one-off, does a rule mechanize into a check, what fingerprint reliably detects the
technology. Per [the unattended-agents skill](../skills/unattended-agents/SKILL.md) ("match the agent
model to the judgment it must make"), run this routine on a capable model. A downgraded model authors a
plausible-but-wrong pack into a PR — the failure review is least likely to catch.

## What each run does

### 1. Read the fleet's manifests, find the unhomed technologies

Enumerate every opted-in repo the token can access (the same discovery the fleet orchestrator uses; see
[routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)). Read each repo's
standing **"Stack manifest"** issue (stage 1's output) over the API — find it by title, never a
hard-coded number. Union the manifest items across the fleet.

Then subtract what the canon already covers: for each technology / API / deployment target, check the
pack shelf (`packs/`). A technology is **homed** — skip it — when any pack owns it, **a stub pack
included**. Also skip anything with an **open mint PR** from a prior run (don't re-author), and skip an
item **every** repo marked `vestigial` (declared-but-unused is not a real sighting). What remains is the
unhomed set — mint each on first sight.

### 2. Gather the evidence for each unhomed technology

For each, identify the repo(s) whose manifest lists it, and read **how they actually use it** — the
build and toolchain config, CI and release workflows, packaging and signing scripts, the relevant
source, and any gotchas already written into those repos' local docs. This is the worked-example pool
the rules distill from. Read over the API (get-file-contents); cross-repo checkouts aren't available in
the sandboxed environment.

### 3. Author the pack — rules and checks, gated on the promotion ladder

Apply [generate-project-instructions](../skills/generate-project-instructions/SKILL.md)' method to the
gathered evidence:

- **Distill portable rules** — strip the origin project, keep what's true for the technology. Ground and
  cite each per the principle above.
- **Descend the promotion ladder** ([item-routing.md](item-routing.md) / [checks/DESIGN.md](../checks/DESIGN.md)):
  a rule a deterministic check can carry is **authored as the check** — the rule module in the new pack,
  its registration, and **a fixture test proving it fires** on a violating input and stays quiet on a
  clean one — not settled as prose. A procedure with a nameable trigger becomes a skill the pack
  requires. Only judgment/knowledge with no signature lands as `RULES.md` prose.
- **Write the four-file pack** — `RULES.md` (the grounded rules, addressed to the next project on this
  stack), `pack.mjs` (add the `marker`/`detect` fingerprint when the technology carries a reliable one,
  so it self-declares on future repos; `detect: null` otherwise), `README.md` (the rule table plus a
  **provenance line** naming the repo(s) it was distilled from), and the index rows
  ([packs/README.md](../packs/README.md), plus [CLAUDE.md](../CLAUDE.md) for a new pack *kind*).

### 4. Open one PR per pack

Push each authored pack to a per-run-unique branch (see [the git-github-advanced skill](../skills/git-github-advanced/SKILL.md))
and open **its own PR** against the canon's default branch — never a direct push, and never several
packs in one PR. A new pack is reviewed differently from a rule addition, so each gets its own review
surface. The write surface is bounded to the new `packs/<tech>/` directory plus its index rows. Keep the
commit and PR terse; reference this routine's tracking issue (below).

### 5. Log the run to the tracker

Append a dated comment to the standing tracking issue for every run that authored at least one pack, and
for any notable skip (an unhomed technology you found nothing groundable for). See [Tracking issue](#tracking-issue).

## Tracking issue

The routine's standing log is the issue titled exactly:

> **Auto-Improvements Tracker - Pack Discovery: Author Packs**

Find it **by title, never a hard-coded number**; open it if missing, reopen if closed while runs still
need logging. Log each run as a **dated comment**: per pack, the technology, the repo(s) it was distilled
from, and the rungs its rules landed on (check ids / skills / prose); for a notable skip, the technology
and why nothing was groundable.

## Gate: weekly, after stage 1

This stage runs centrally on the **weekly full sweep**, the same cadence stage 1 refreshes the manifests.
It reads the **standing** "Stack manifest" issues — the freshest available — so it needs no hard barrier
with stage 1: exactly as [promote](promote.md) reads already-merged canon and dedup reads the previously
merged canon, this reads whatever manifests stand.

## What this routine must never do

- **Never author from imagination or pad** — every rule traces to the fleet's real usage; an ungroundable
  rule is not written. The pack may be small; it may not be invented.
- **Never re-author an existing pack** — a stub counts as a home, and an open mint PR counts as in
  progress. Dedup against both. A pack that exists is [promote](promote.md)'s to fill, not this stage's to
  replace.
- **Never mint for a vestigial-only technology** — declared-but-unused across the whole fleet is not a
  real sighting.
- **Never exceed the bounded write surface** — per pack, only its new `packs/<tech>/` directory (and any
  check's registration + fixture) plus the index rows, in its own PR. Never alter an origin project or an
  unrelated pack.

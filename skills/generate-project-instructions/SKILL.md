---
name: generate-project-instructions
description: Decompose a project into its pack facets (working-style class, technology, aspect, domain) and extract its working instructions into reusable packs plus a thin project-specific overlay. Use when a project has no established working style yet, or it exhibits a facet no pack covers — during bootstrap of a fresh/empty repo, or on an uplevel request.
---

# Generate project instructions — extract packs, not a project doc

This skill grows the corpus's pack library using the project in front of you as the evidence. The
owner's projects recur — not as wholes, but **along axes**: the same working style returns with a
different product, the same technology returns with a different working style, the same audience
returns on a different stack. The first project to exhibit a facet pays the cost of working out how
that facet is handled; a pack is how every later project sharing it starts from the answer instead of
re-deriving it.

The deliverable is therefore **a set of portable packs plus one thin local doc**, never a single
document:

- **Pack seeds and refinements** — one `packs/<facet>/` per facet where this project has real portable
  insight, each written as if this project didn't exist. **These are the primary deliverable.**
- **The project overlay** — a thin doc in the project's own tree: only the concrete values this
  project plugs into its packs' slots (its real commands, paths, names, metrics).

The failure mode this skill exists to prevent: investigating the repo and producing one competent "how
to work on this repo" document — real commands, real paths, this product's concepts — with the
reusable core never separated out. That document helps exactly one project and teaches the corpus
nothing. If portable guidance ends up in the project's docs, or the project's file names end up in any
pack, the split is wrong.

## 1. Gather the evidence

Read the project before writing a word: README and existing docs, `CLAUDE.md` and everything it
imports, dependency and build manifests, scripts and CI, the test layout, git history and recent
PRs/issues, and any conversation with the owner about how they want to work. You are collecting two
things, both grounded in what you actually find:

- the **facets** this project exhibits (step 2), and
- every **candidate rule** — each convention, procedure, or quality bar the project works by — ready to
  be sorted by owner (step 3).

Invent nothing. If a call that changes the outcome is genuinely open, ask the owner one focused
question (via the structured popup); otherwise take the sensible default and note it.

## 2. Decompose into facets, and check the shelf per facet

A project is a bundle of **facets**, each a candidate pack on its own axis:

- **Class — the working style.** How work runs end to end: the loop by which a change is proposed,
  verified, and shipped; the production bar; audience and longevity. Test: the pack still fits a
  project on a different stack, for a different product idea.
- **Technology — the platform.** True for any project on that platform, whatever its class or product.
  Test: the pack still fits when the product and the working style change. The first project on a new
  platform mints its pack — an iPhone app arriving tomorrow mints `iphone-app` the same way
  `chrome-extension` and `aws-sam` were minted.
- **Aspect — a separable slice of concern**, usually with its own on-switch. `chrome-extension-release`
  is the same technology as `chrome-extension` at a different moment: the release/store standard a
  project declares only once it ships. Split an aspect out of its parent facet when its rules activate
  at a different time or under a different decision than the parent's.
- **Domain — the audience or setting**, when it changes how work is done. A children's-app pack would
  carry design-review, requirement-processing, and compliance rules that hold whether the app is
  Flutter or web; a regulated-industry pack likewise. A domain that doesn't change the working rules
  isn't a facet worth a pack.

**The product itself is never a facet** — "this specific product" doesn't recur, by definition; its
rules are the overlay.

<example>
One extension project can exhibit four facets at once: `spec-driven-product` (class),
`chrome-extension` + `node` (technologies), `chrome-extension-release` (aspect, once it ships) — and
its overlay holds only what none of them own.
</example>

Then check the shelf **per facet** (`packs/` here; `.claudinite/packs/` in a consuming repo):

- **Covered** → declare it (technology facets are usually already declared from the fingerprint) and
  move on — unless this project's evidence **sharpens or contradicts** the pack, which becomes a
  refinement PR to that pack, not a fork. Each further project of a facet is another exemplar: the
  pack should read as the intersection-plus-union of all of them, and a rule only one exemplar
  supports should say so or wait.
- **Uncovered, with real portable insight in the evidence** → this skill mints it (steps 3–4).
- **Uncovered, but this project has nothing durable to say about it yet** → leave it; a pack of
  placeholders helps nobody.

Write each facet down — a short name plus one defining sentence — before drafting anything; every
sorting decision in step 3 tests against them.

## 3. Sort every candidate rule to the single facet that owns it

For each rule from step 1, apply the **portability strip per facet**: delete from the rule everything
the facet doesn't keep, and see whether something meaningful survives.

- Delete the product and the stack, keep the loop — survives? → the **class** pack.
- Delete the product and the working style, keep the platform — survives? → the **technology** (or
  **aspect**) pack.
- Delete the stack, keep the audience/setting — survives? → the **domain** pack.
- Survives nothing → project-specific: the **overlay**.

Route each rule to **exactly one owner** — the facet whose whole population the rule serves. "True for
any Node service" belongs to `node`, not to this project's class pack, even if every project of the
class happens to use Node. Rewrite what lands in a pack project-agnostically and parameterized, the
way research-project does ("read *input* as whatever it means for your project").

Then gate the pack-bound rules on the promotion ladder ([checks/DESIGN.md](../../checks/DESIGN.md)): a
rule a deterministic check could enforce, or a procedure with a nameable trigger a skill could carry,
gets flagged as a check/skill candidate in the seed rather than settling permanently as prose. What
remains in a `RULES.md` is the always-relevant judgment core of its facet. Dedupe it against the
corpus — a rule the basics baseline or an existing skill already owns is not pack material.

## 4. Write each pack

Mint a pack for a facet only when its surviving rules clear the bar — several durable rules, not one
stray (a single rule joins the nearest existing pack, or waits as a handoff note). Each
`packs/<facet>/` needs four things (mirror `research-project/` and `chrome-extension/`):

- **`RULES.md`** — the playbook, addressed to the *next* project sharing the facet, on day one. Open
  with the facet's one-line definition and "a default to adapt, not a contract". Principle-first, each
  rule carrying its why. It loads at session start for every declaring project, so every line pays
  rent — cover the facet, not everything you noticed.
- **`pack.mjs`** — the manifest. Class/domain/aspect packs: `always: false`, `marker: null`,
  `detect: null` (declaration is authoritative). Technology packs: add the `marker`/`detect`
  fingerprint when the repo carries a reliable one, so `--init` seeds the pack into a fresh
  declaration; the marker only *suspects* a pack is wanted, it never forces its declaration.
  Discovery is structural — the directory is the registration.
- **`README.md`** — the pack's rule table (section ≤5 words | how enforced), plus one provenance line
  naming the project it was distilled from.
- **Index entries** — a row in [packs/README.md](../../packs/README.md) and, for a new pack kind, the
  matching line in the corpus index [CLAUDE.md](../../CLAUDE.md).

The acid test before proposing any pack: **a reader must not be able to tell which project it was
extracted from.** Any surviving repo path, command line, or product noun marks a rule that belonged in
the overlay.

## 5. Write the project overlay

In the project's own tree (its `CLAUDE.md`, or the local-guidance doc its `CLAUDE.md` imports): the
project's concrete values for its packs' slots — real setup/run/verify commands, real paths, its
actual inputs, metrics, and invariants — plus which packs it declares. Keep it thin and specific;
anything you're tempted to explain at length is either facet material (a pack) or inferable from the
code (omit it).

## 6. Deliver through the owner's approval gates

- **Every pack seed or refinement → a PR against Claudinite.** Minting or changing a pack is the
  owner's call, and the PR is that gate — no corpus change lands unattended
  ([growth/README.md](../../growth/README.md)). From a consuming repo, never edit the read-only
  `.claudinite/` mount: open the Claudinite PR when the session can reach that repo; otherwise commit
  the seed under the project's own docs, clearly marked as a proposed pack, and open a Claudinite
  issue pointing at it so the central promote phase lifts it.
- **The overlay → the project's normal branch/PR.**
- **Declare a new pack** in the project's `.claudinite-checks.json` only after it has merged and the
  mount re-synced — declaring an id the mounted registry doesn't know is an unknown-pack settings
  error (a blocking `config` finding). Until then, note the pending declaration as a follow-up in the project PR.
- **Existing projects sharing a facet keep their local docs for now.** Once the pack lands, the growth
  dedup phase prunes what the canon newly owns; don't pre-trim a project against an unmerged pack.

Close with a short report: each facet and its one-line definition, with its shelf verdict (declared /
refined / minted / left alone); the sort tally (rules sent to each pack / the overlay /
check-or-skill candidates); and links to the PRs.

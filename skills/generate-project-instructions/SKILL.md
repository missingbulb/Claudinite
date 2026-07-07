---
name: generate-project-instructions
description: Work out a project's class and extract its working instructions — a reusable class pack proposed to the corpus, plus a thin project-specific overlay. Use when a project has no established working style yet, or its class has no pack — during bootstrap of a fresh/empty repo, or on an uplevel request.
---

# Generate project instructions — extract the pack, not a project doc

This skill grows the corpus's library of **project-class packs**
([packs/research-project/RULES.md](../../packs/research-project/RULES.md) is the model) by one, using
the project in front of you as the evidence. The owner runs recurring classes of project; the first
project of a class pays the cost of working out how that class should be run, and the pack is how every
later project of the class starts from that answer instead of re-deriving it.

The deliverable is therefore **two documents with opposite audiences**, never one:

- **The class pack** — `packs/<class>/RULES.md` in Claudinite: the working playbook for *every* project
  of this class, written as if this project didn't exist. **This is the primary deliverable.**
- **The project overlay** — a thin doc in the project's own tree: only the concrete values this project
  plugs into the playbook's slots (its real commands, paths, names, metrics).

The failure mode this skill exists to prevent: investigating the repo and producing one competent "how
to work on this repo" document — real commands, real paths, this product's concepts — with the reusable
core never separated out. That document helps exactly one project and teaches the corpus nothing. If
class-portable guidance ends up in the project's docs, or the project's file names end up in the pack,
the split is wrong.

## 1. Check the shelf first

List the existing project-class packs (`packs/` here; `.claudinite/packs/` in a consuming repo — class
packs are the prose-only manifests with `detect: null`). If one fits this project, there is nothing to
generate: declare it in `.claudinite-checks.json`, write the overlay (step 6), and stop. Mint a new
pack only for a genuinely uncovered class.

## 2. Gather the evidence

Read the project before writing a word: README and existing docs, `CLAUDE.md` and everything it
imports, dependency and build manifests, scripts and CI, the test layout, git history and recent
PRs/issues, and any conversation with the owner about how they want to work. You are collecting two
things, both grounded in what you actually find:

- the **class** this project belongs to (step 3), and
- every **candidate rule** — each convention, procedure, or quality bar the project works by — ready to
  be sorted by scope (step 4).

Invent nothing. If a call that changes the outcome is genuinely open, ask the owner one focused
question (via the structured popup); otherwise take the sensible default and note it.

## 3. Name the class — a working style, not a stack and not a product

Place the project on the axes that change how work is run: what is built (product / library / service /
script), the production bar (throwaway ↔ users depend on it), the loop by which a change is proposed,
verified, and shipped, audience and longevity, UI-centrality, solo vs team, domain constraints. The
**class** is the recurring bundle of those answers — a kind of project the owner will run again — and it
must be nameable at the altitude of a working style:

- **Technology is not a class.** Language, framework, and platform gotchas belong to technology packs
  (`chrome-extension`, `aws-sam`, …), declared separately from their own fingerprints.
- **The product is not a class.** A class named after what this project does for its users is just the
  project again.
- The test: **the class name and its one-line definition still fit if this project were rebuilt on a
  different stack, for a different product idea.**

<example>
`research-project` — run an algorithm over similarly-formatted inputs, score it against owner-provided
ground truth, improve it in numbered, reviewable iterations. Named by its loop; nothing in it says
Python or images.
</example>

<example>
A store-shipped end-user product developed spec-first: every requirement is a numbered leaf claimed by
an executable proof, expected results are owner-owned, releases cut automatically while main stays
green. Again a loop; nothing in it says Chrome extension.
</example>

<example>
Not classes: "the TLDR extension" (a project), "chrome-extension" (a technology), "AWS-backed products"
(a stack).
</example>

Write the class down — a short name plus one defining sentence — before drafting anything; every
sorting decision in step 4 tests against it.

## 4. Sort every candidate rule by the widest set of projects it's true for

For each rule from step 2, apply the **portability strip**: delete the project — its name, file paths,
command lines, product nouns — and see what survives.

- **Survives for the whole class** → the pack. Rewrite it project-agnostically and parameterized, the
  way research-project does ("read *input* as whatever it means for your project").
- **True for any project on this technology, class aside** → a technology pack owns it, not the class
  pack. If that pack exists, don't restate it; if it doesn't, record the rule as a handoff note for
  that pack — a separate change, not this one.
- **Nothing meaningful survives the strip** → project-specific: the overlay.

Then gate the pack-bound rules on the promotion ladder ([checks/DESIGN.md](../../checks/DESIGN.md)): a
rule a deterministic check could enforce, or a procedure with a nameable trigger a skill could carry,
gets flagged as a check/skill candidate in the seed rather than settling permanently as prose. What
remains in `RULES.md` is the always-relevant judgment core of the class. Dedupe it against the corpus —
a rule the universal baseline or an existing skill already owns is not class material.

## 5. Write the class pack

`packs/<class>/` needs four things (mirror `research-project/`):

- **`RULES.md`** — the playbook, addressed to the *next* project of the class on day one. Open with the
  class's one-line definition and "a default to adapt, not a contract". Principle-first, each rule
  carrying its why; the class's core loop, definition of done, verification bar, and continuity are the
  usual spine. It loads at session start for every declaring project, so every line pays rent — cover
  the class, not everything you noticed.
- **`pack.mjs`** — the prose-only class manifest: `always: false`, `marker: null`, `detect: null`
  (declaration is authoritative; classes have no fingerprint). Discovery is structural — the directory
  is the registration.
- **`README.md`** — the pack's rule table (section ≤5 words | how enforced), plus one provenance line
  naming the project it was distilled from.
- **Index entries** — a row in [packs/README.md](../../packs/README.md) and the project-class line in
  the corpus index [CLAUDE.md](../../CLAUDE.md).

The acid test before proposing it: **a reader must not be able to tell which project it was extracted
from.** Any surviving repo path, command line, or product noun marks a rule that belonged in the
overlay.

## 6. Write the project overlay

In the project's own tree (its `CLAUDE.md`, or the local-guidance doc its `CLAUDE.md` imports): the
project's concrete values for the playbook's slots — real setup/run/verify commands, real paths, its
actual inputs, metrics, and invariants — plus which packs it declares. Keep it thin and specific;
anything you're tempted to explain at length is either class material (pack) or inferable from the code
(omit it).

## 7. Deliver through the owner's approval gates

- **The pack seed → a PR against Claudinite.** Minting a class is the owner's call, and the PR is that
  gate — no corpus change lands unattended ([growth/README.md](../../growth/README.md)). From a
  consuming repo, never edit the read-only `.claudinite/` mount: open the Claudinite PR when the
  session can reach that repo; otherwise commit the seed under the project's own docs, clearly marked
  as a proposed pack, and open a Claudinite issue pointing at it so the central promote phase lifts it.
- **The overlay → the project's normal branch/PR.**
- **Declare the pack** in the project's `.claudinite-checks.json` only after the pack has merged and the
  mount re-synced — declaring an id the mounted registry doesn't know fails the blocking
  `pack-declaration` check. Until then, note the pending declaration as a follow-up in the project PR.
- **Existing projects of the class keep their local docs for now.** Once the pack lands, the growth
  dedup phase prunes what the canon newly owns; don't pre-trim a project against an unmerged pack.

Close with a short report: the class and its one-line definition; the sort tally (rules sent to the
pack / the overlay / technology-pack handoffs / check-or-skill candidates); and links to the PRs.

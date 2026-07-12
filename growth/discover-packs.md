# Growth — discover packs (central, weekly)

A single weekly process that grows the pack library, run **once, centrally, from the Claudinite home
repo**. It runs the whole pipeline end to end — **manifest → suggest → populate → open PR** — as one
routine, not a per-repo scan that files an issue for a separate stage to read later. It is
Claudinite-internal; consuming repos don't vendor or `@import` it.

**Why central.** The last step opens PRs against the **canon**, which needs the fleet-wide token — so,
like [promote](promote.md), this runs centrally and reads every repo over the API. A per-repo worker is
scoped to its own repo and can't write the canon, which is why the manifest isn't a per-repo side-task:
it's step 1 of *this* process.

**The four steps are distinct, not conflated.** Cataloguing a repo's stack (step 1) and judging whether
the canon needs a pack (step 2) are different levels of analysis — step 1 decides nothing about packs.
They are sequential steps of one process, not one merged judgment and not two separate routines.

## The governing principle — distilled from worked examples, never from imagination

A pack this routine authors is *distilled from worked examples, not written from imagination* — the
constraint that makes automated authoring safe. **The repos actually using a technology are the worked
examples.** Every rule must trace to how the fleet really uses the technology — a real build config, a
real packaging/signing step, a gotcha a project already hit — and be cited. **Never pad** with
speculative best-practice rules the fleet doesn't demonstrate; a rule you can't ground, you don't write.
A smaller honest pack beats a padded one. And **never open an empty stub to fill later** — the point is
to populate it now (step 3); the owner's directive is that there's no value in a placeholder that waits.

## Run on a capable model

Every step past the first is heavy judgment — is a technology genuinely unhomed, which usage is a
portable rule vs. a project's one-off, does a rule mechanize into a check, what fingerprint reliably
detects the technology. Per [the unattended-agents skill](../skills/unattended-agents/SKILL.md) ("match
the agent model to the judgment it must make"), run this routine on a capable model.

## The pipeline

### Step 1 — manifest each repo

Enumerate every opted-in repo the token can access (the same discovery the fleet orchestrator uses; see
[routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)). For each, produce
a **manifest** of what it is built on and how it ships, by reading its files over the API. This step
**only catalogues** — it does not look at the pack shelf or judge whether anything deserves a pack. Run
it with this instruction:

> Produce a **manifest** of what this project is built on and how it ships — a comprehensive,
> evidence-grounded inventory. You are **only** observing and cataloguing. You are **not** deciding
> anything about tooling, packs, standards, or what should change; you make no recommendations, and you
> do not compare this repo against anything outside it.
>
> **Ground every entry in the repo's files** — dependency and build manifests, lockfiles, toolchain and
> config files, CI and release workflows, packaging and signing scripts, the source structure, and the
> docs. For each entry, cite the concrete evidence — the file (and the line/section or step) that proves
> it. Never infer from "projects like this usually…"; if the repo doesn't show it, it is not in the
> manifest. If something is present but appears vestigial or aspirational (declared but unused), include
> it and say so.
>
> Catalogue across **three axes**. Put each item under the single axis that fits best; when it genuinely
> spans two, place it under the primary and cross-note the other.
>
> 1. **Technologies** — languages and their versions, runtimes, frameworks, build systems, and the major
>    libraries that shape how you write and build here (the load-bearing ones, not every transitive
>    dependency). Evidence: manifests, lockfiles, toolchain/config.
> 2. **APIs & external services** — every third-party service, cloud API, SDK, auth provider, datastore,
>    message bus, or external integration the code actually talks to. Evidence: client SDK dependencies,
>    config/env keys, call sites.
> 3. **Deployments & distribution** — how and where this ships: packaging format(s), distribution
>    channel(s), the runtime/host it targets, signing/notarization, and the release mechanism. Evidence:
>    release workflows, packaging and signing scripts, deploy config.
>
> For **each** item report: **name**; **axis**; **evidence** (the file(s), and what they show); **what
> it is in this repo** (one line); **prominence** — one of `core` (the project is built on it),
> `supporting` (used but peripheral), `vestigial` (present but apparently unused); and a **`?` flag** if
> you are uncertain the item is real or correctly characterised. Prominence is a factual read of how
> central the item is *in this repo* — **not** a judgment about whether it deserves any downstream
> treatment.
>
> Be **comprehensive over concise**: a later step filters and decides, so a true item you omit is lost,
> while an over-included one is cheaply dropped. When unsure whether something rises to an entry, include
> it with the `?` flag. Do **not** deduplicate against, reference, or even consider any pack, tool, or
> catalogue outside this repository.
>
> Output the manifest as Markdown grouped under the three axis headings, one bullet per item with the
> fields labelled.

Log each repo's manifest to this routine's tracker (below) so the raw read stays auditable.

### Step 2 — suggest new packs

Now hold every repo's manifest at once. **Union the items across the fleet**, then subtract what the
canon already covers: for each technology / API / deployment target, check the pack shelf (`packs/`). A
technology is **homed** — drop it — when any pack owns it, **a stub pack included**. Also drop anything
with an **open pack-authoring PR** from a prior run, and anything **every** repo marked `vestigial`
(declared-but-unused is not a real sighting). What remains is the candidate set — **suggest a pack for
each, on first sight** (the owner's posture: don't wait for a technology to recur). Because this step
holds the whole fleet, a candidate carries *every* repo that uses it — the evidence pool step 3 draws on.

### Step 3 — populate the pack

For each candidate, **author a populated pack** by distilling from the repos that use the technology.
Read how they actually configure, build, sign, and ship it (over the API), plus any gotchas already in
their docs — the worked-example pool — and apply [generate-project-instructions](../skills/generate-project-instructions/SKILL.md)'
method (don't re-derive it): strip the origin project, keep what's true for the technology, and descend
the promotion ladder ([item-routing.md](item-routing.md) / [checks/DESIGN.md](../checks/DESIGN.md)) —
a rule a deterministic check can carry becomes the **check plus a fixture test** (it fires on a
violating input, stays quiet on a clean one), a procedure with a nameable trigger becomes a skill the
pack requires, and only signature-less judgment lands as `RULES.md` prose. Ground and cite every rule;
never pad. Write the four-file pack — `RULES.md`, `pack.mjs` (add the `marker`/`detect` fingerprint when
the technology carries a reliable one, so it self-declares on future repos; `detect: null` otherwise),
`README.md` (rule table + a **provenance line** naming the repo(s) it was distilled from), and the index
rows ([packs/README.md](../packs/README.md), plus [CLAUDE.md](../CLAUDE.md) for a new pack *kind*).

### Step 4 — open one PR per pack

Push each authored pack to a per-run-unique branch (see [the git-github-advanced skill](../skills/git-github-advanced/SKILL.md))
and open **its own PR** against the canon's default branch — never a direct push, and never several packs
in one PR. A new pack is reviewed differently from a rule addition, so each earns its own review surface.
The write surface is bounded to the new `packs/<tech>/` directory (with any check's registration and
fixture) plus its index rows. Keep the commit and PR terse; reference this routine's tracking issue.

## Tracking issue

The routine's standing log is the issue titled exactly:

> **Auto-Improvements Tracker - Pack Discovery**

Find it **by title, never a hard-coded number**; open it if missing, reopen if closed while runs still
need logging. Log each run as a **dated comment**: the manifests read (step 1, for audit), and per
authored pack the technology, the repo(s) it was distilled from, and the rungs its rules landed on
(check ids / skills / prose); for a candidate you found nothing groundable for, name it and why.

## Gate: weekly, central, post-barrier

Runs centrally on the **weekly full sweep** — a repo's stack is slow-moving, so a weekly cadence is
right and adds no daily cost. Like promote, it's a central step the orchestrator dispatches once, not a
per-repo planned unit.

## What this routine must never do

- **Never conflate steps 1 and 2** — the manifest step catalogues and never consults the pack shelf; the
  suggest step is where the shelf and the pack decision come in.
- **Never author from imagination or pad** — every rule traces to the fleet's real usage; an
  ungroundable rule is not written. The pack may be small; it may not be invented.
- **Never open an empty stub to fill later** — populate it now (step 3); a placeholder that waits has no
  value.
- **Never re-author an existing pack** — a stub counts as a home, and an open pack-authoring PR counts as
  in progress. Dedup against both; a pack that exists is [promote](promote.md)'s to fill, not this
  routine's to replace.
- **Never mint for a vestigial-only technology** — declared-but-unused across the whole fleet is not a
  real sighting.
- **Never exceed the bounded write surface** — per pack, only its new `packs/<tech>/` directory (and any
  check's registration + fixture) plus the index rows, in its own PR. Never alter an origin project or an
  unrelated pack.

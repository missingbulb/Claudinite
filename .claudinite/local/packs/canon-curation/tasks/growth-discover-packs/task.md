# Growth — discover packs (one central weekly sweep)

The pack-discovery pipeline: over the participating members, **manifest → suggest → populate → open PR** — catalogue each member's stack, judge whether the canon needs a pack for an unhomed technology, and author a *populated* pack for each, one PR per pack. Declared only by the canon home repo, so it runs **once, centrally** — a single weekly sweep over the whole fleet, where the earlier per-member model relied on a week-long stagger for first-sight dedup.

You run under the executor, dispatched by a `ready-for-agent` issue whose **Context section is binding scope**: it names the full member list to manifest. Process them **all in this one run** — do not enumerate the fleet yourself or widen past the Context.

The task's declared outcome ceiling is **`open-pr`**: each authored pack lands as an owner-approved PR, never auto-merged.

## The governing principle — distilled from worked examples, never from imagination

A pack this task authors is *distilled from worked examples, not written from imagination* — the constraint that makes automated authoring safe. **The member actually using the technology is the worked example.** Every rule must trace to how it really uses the technology — a real build config, a real packaging/signing step, a gotcha already in its docs — and be cited. **Never pad** with speculative best-practice rules the evidence doesn't demonstrate; a rule you can't ground, you don't write. A smaller honest pack beats a padded one. And **never open an empty stub to fill later** — populate it now (step 3).

## Conventions used in this doc

- **The members.** The repos named in Context. Read each over the API — you run centrally, not inside them.
- **The canon.** The Claudinite home repo (this repo), where authored packs land.
- **GitHub access is MCP-only** (`mcp__github__*`); the run has no shell GitHub access and no cross-repo checkout, so never reach for `gh`/`curl`.
- **The steps are distinct, not conflated.** Cataloguing a member's stack (step 1) and judging whether the canon needs a pack (step 2) are different levels of analysis — step 1 decides nothing about packs.

## The pipeline

### Step 1 — manifest each member's stack

For each member, produce a manifest of what it is built on and how it ships, by reading its files over the API. This step **only catalogues** — it does not look at the pack shelf or judge whether anything deserves a pack. Ground every entry in the repo's files (dependency/build manifests, lockfiles, toolchain/config, CI and release workflows, packaging/signing scripts, source structure, docs) and cite the concrete evidence; never infer from "projects like this usually…". Catalogue across three axes — **Technologies** (languages/versions, runtimes, frameworks, build systems, load-bearing libraries), **APIs & external services** (third-party services, cloud APIs, SDKs, auth, datastores the code actually talks to), **Deployments & distribution** (packaging, channels, target host, signing, release mechanism). For each item report name, axis, evidence, one-line "what it is here", prominence (`core`/`supporting`/`vestigial`), and a `?` flag when uncertain. Be comprehensive over concise — a later step filters.

### Step 2 — suggest new packs

Check each manifest against the canon's pack shelf (`packs/`). A technology is **homed** — drop it — when any pack owns it, **a stub pack included**. Also drop anything with an **open pack-authoring PR** on the canon **or already authored earlier in this same run** (the first-sight dedup — now trivial, since one run sees every member), and anything marked **`vestigial`** (declared-but-unused is not a real sighting). What remains is the candidate set — **suggest a pack for each, on first sight** (don't wait for the technology to recur).

### Step 3 — populate the pack

For each candidate, **author a populated pack** by distilling from how the member actually uses the technology — its build/toolchain config, CI and release workflows, packaging/signing scripts, relevant source, and any gotchas already in its docs. Apply [generate-project-instructions](/packs/grow_with_claudinite/skills/generate-project-instructions/SKILL.md)' method (don't re-derive it): strip the origin project, keep what's true for the technology, and descend the promotion ladder ([engine/checks/DESIGN.md](/engine/checks/DESIGN.md)) — a rule a deterministic check can carry becomes the **check plus a fixture test** (fires on a violating input, quiet on a clean one), a procedure with a nameable trigger becomes a skill the pack requires, and only signature-less judgment lands as `RULES.md` prose. Ground and cite every rule; never pad. Write the four-file pack — `RULES.md`, `pack.mjs` (add the `marker`/`detect` fingerprint when the technology carries a reliable one, so it self-declares on future repos; `detect: null` otherwise), `README.md` (rule table + a **provenance line** naming the member it was distilled from), and the index rows ([packs/README.md](/packs/README.md), plus the corpus map in [README.md](/README.md) for a new pack *kind*).

### Step 4 — open one PR per pack

Push each authored pack to a per-run-unique branch and open **its own PR** against the canon's default branch — never a direct push, and never several packs in one PR (a new pack is reviewed differently from a rule addition). The write surface is bounded to the new `packs/<tech>/` directory (with any check's registration and fixture) plus its index rows. Keep the commit and PR terse, and **put the issue reference in the commit message** (`Refs #<n>` for the tracker below) — the `basics` `task-lifecycle` check reds CI on a commit that cites none.

## Tracking issue

The task's standing log is the issue titled exactly **`Claudinite tracker: Pack Discovery`** on the canon. Find it **by that exact title, never a fuzzy match or a hard-coded number**; create it already closed if missing. **Never open, close, or reopen it** — its state carries no meaning, only the log does. Log each run as a **dated comment**: the members processed, and per authored pack the technology and the rungs its rules landed on (check ids / skills / prose); for a candidate you found nothing groundable for, name it and why.

## What this task must never do

- **Never conflate steps 1 and 2** — the manifest step catalogues and never consults the pack shelf.
- **Never author from imagination or pad** — every rule traces to the member's real usage; an ungroundable rule is not written. The pack may be small; it may not be invented.
- **Never open an empty stub to fill later** — populate it now (step 3).
- **Never re-author an existing pack** — a stub counts as a home, and an open pack-authoring PR (or one authored earlier in this run) counts as in progress. A pack that exists is the central promote stage's to fill, not this task's to replace.
- **Never author for a `vestigial` technology** — declared-but-unused is not a real sighting.
- **Never exceed the bounded write surface**, and **never alter a member repo** — per pack, only its new `packs/<tech>/` directory (and any check's registration + fixture) plus the index rows, in its own PR.
- **Run on `opus`** — past step 1 every step is heavy judgment; this task declares `agent_model: opus` and the executor dispatches its subagent there.

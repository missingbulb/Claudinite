## 2026-08-16 · born · Claudinite growth: mint the headless-browser canon pack (#905)
- **Source:** three fleet members that drive a browser from their own process, read in full -
  `missingbulb/EdFringeNow`'s pinned-Chromium visual-requirements harness,
  `missingbulb/CrosswordChat`'s browser rasterisation for goldens and generated store artifacts, and
  `missingbulb/ClaudiniteWebsite`'s interactive responsive check. `missingbulb/EdFringeAllocator`
  carries a vestigial fourth instance in a retired prototype, noted and not leaned on.
- **Reason:** three members drive a browser from code for three different reasons and no canon pack
  owned the technology. The nearest coverage stopped short: `basics`'s writing-tests skill owns
  which engine a golden needs, its tolerance, self-skipping and the re-baselining gate and says
  nothing about getting a browser; `executable-requirements` homes the determinism principles with
  jsdom/satori and Flutter recipes; `html` owns the case where the agent has no browser at all. The
  gap was found and explicitly deferred by the 2026-08-02 fleet sweep so it would not be lost, and
  this run authored it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the pack manifest, prose only and carrying no coded rules - every grounded case is
  a runtime browser behaviour (a secure origin gating geolocation, font fallback deciding layout, a
  scroll dismissing a hover state) or a judgment about a harness's shape, and neither has a
  repo-state signature a check could read without asserting that some particular call still exists,
  which is the shape the corpus rejects outright. Fingerprinted on a driver reference in JS/TS
  source - a browser-automation module specifier or a `.launch(` call site.
- **Rejected:** fingerprinting off a dependency manifest. EdFringeNow drives a globally installed
  driver with no dependency entry anywhere, so a manifest scan would miss it; the source scan was
  verified against both members' real lines and quiet on prose and on a `L.map(` call.
- **Landed:** #905 (tracker #642) · pack version 1.

## 2026-08-19 · reworded · Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060)
- **Reason:** the pack carried a whole `## Boundary` section about what its neighbours own, in
  `RULES.md` and in the README. A pack is a self-contained unit and its neighbours are not its
  subject; a probe found 51 such crossings across 22 packs, each a second copy of what
  `ruleRoutingGuidance.excludes` already carries in one machine-read field - the field the pack
  directory routes a lesson by. Both sites now state what the pack does not cover without naming who
  does. A pointer to another pack's procedure was kept, being what makes the procedure findable.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1060 (Closes #1057) · pack version 4.

## 2026-08-23 · reworded · Pack manifests by convention: the tree declares the pack (#1248)
- **Reason:** most of what the manifest carried had one correct value, either the one the pack's own
  directory already gave or the one meaning "this pack does not do that", so `id`, `prose`, `badge`,
  `skills`, `worldRules` and `workRules` are resolved from the pack directory and the manifest
  states none of it. `minEngineVersion` rises to the engine release that reads all of it, because a
  manifest with no `id` is dropped outright by a pre-convention engine, which fails the mount
  self-test and stops that member converging at all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1248 (Closes #1246) · pack version 60822.1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers and a scope note handing
  the ground either side of it to testing and workflow decisions. Neither changes what a session
  does, every session in every declaring repo paid for it, and the README and the manifest's
  `ruleRoutingGuidance` already carried both. Across the corpus the sweep took non-rule prose from
  2,900 words to 1,080.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

# core — working with Claudinite itself

- **Reading a rule, check or skill that arrived from Claudinite** — it is vendored, under
  `.claudinite/shared/`, and the update flows replace that whole tree. Never edit anything there:
  change it in the canon, or carry the difference in this repo's own `.claudinite/local/packs/`.

- **Finding a mounted skill, or following a link from inside one you already loaded** — a canon
  skill lives at `.claudinite/shared/packs/<pack>/skills/<name>/SKILL.md`; there is no flat
  `.claudinite/shared/skills/`. When the `Skill` tool announces a per-session flat "base directory"
  (e.g. `.claude/skills/<name>/`) that holds only that one `SKILL.md`, any relative link the
  skill's own text carries (to a sibling doc, a sibling skill) was written for its real home and
  dangles from that announced base — resolve such links against the canon path instead.

- **Wanting a pack's rules to apply here** — declare its id in `.claudinite-settings.json`. Nothing
  activates by being mounted, fingerprinted or present on disk, so a pack whose files you can see
  but whose id is undeclared contributes no prose, no checks, no skills and no tasks.

- **Adding a pack** — run the `adopt-pack` skill, which declares it, asks its adoption questions,
  re-vendors and scaffolds. Never hand-copy a pack's content into the repo.

- **Setting a project up on Claudinite for the first time** — the `adopt-claudinite` skill.

- **Deciding which pack owns a lesson** — read `packs/directory.GENERATED.md`, the catalog of
  *every* canon pack, never the mounted subset: the mount holds only what this repo declares, so the
  pack that owns the territory may be absent and invisible. When the owning pack is merely too
  narrow, widen its `ruleRoutingGuidance.belongs` rather than opening a local pack beside it.

- **Judging whether Claudinite is current here** — read the stamp's `engineVersion` and
  `packVersions`, never `claudinite.updated` or `ref`: the versioned flows stamp versions and
  nothing else, so those two hold the provenance of the last full re-vendor rather than of this
  mount, and a member converging nightly reads as weeks stale.

- **Answering "why did the mount not update"** — read the member's own artifacts (its declaration,
  its stamp, the head sha's runs) before theorizing about a platform setting; propose a settings
  change as a conclusion, never as a diagnosis.

- **Finding a fix that belongs in the canon while working in a member repo** — a member's own
  GitHub scope reaches only itself, so a scratch clone of the canon is read-only in practice: a
  fetch succeeds but a push 403s. That is an organisation egress policy, not a bug to route
  around — don't retry with another remote or token, and don't edit the vendored
  `.claudinite/shared/` mount in place to compensate (the next re-vendor overwrites the edit).
  Finish and test the fix against the scratch clone, then open an issue **in the member repo**
  carrying the full diff as a patch block plus the verification you ran, so a session that does
  have canon scope can apply it.

- **A file a vendored module references but that is absent from `.claudinite/shared/`** — that is
  evidence about the *vendor set*, not about the canon. Check the canon itself (a shallow clone, or
  a canon-scoped session) before filing an issue claiming the canon never shipped the file — an
  omission in the vendoring rule reads identically to a genuine gap, and authoring the missing
  content in that case just creates a duplicate of something that already exists upstream. Where
  the canon can't be checked either, report only that the mount lacks the file.

- **Before pushing a change that touches `.github/workflows/`, `.claudinite-checks.json`, or any
  pack config** — run the engine's own conformance runner
  (`node .claudinite/shared/engine/checks/check_the_world.mjs`) locally first. It is the same
  script CI's conformance job runs, so a `[BLOCKING]` finding caught locally in seconds skips a
  full push → PR → CI → diagnose → fix → re-push round trip.

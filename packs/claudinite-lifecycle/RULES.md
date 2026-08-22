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

- **A file cited by canon code or docs but absent from the vendored mount** — that's evidence
  about the *vendor set* (a vendoring omission), not evidence the canon lacks it. Before filing an
  issue asking to author what looks "missing," check whether the file genuinely exists upstream (a
  shallow clone of the canon reads it); a vendoring gap and a real canon gap look identical from
  inside the mount alone, and treating the first as the second asks for a duplicate of something
  that already exists.

- **A pile of bot comments on a stuck `[claudinite-task]` `task:status:needs-human-*` issue** is the
  stale-dispatch watchdog nagging that nobody executed it, not proof the underlying job is
  re-failing every cycle. Before accepting a "this has been failing every hour since X" framing
  (from an owner or from the comment volume), count what actually landed (`git log --grep` for the
  worker's own commit subject) and read that slot's own scheduler job log — the flagged run may be
  a single one-off, not a pattern, and shipping a fix for a framing that turns out wrong can itself
  do real damage.

- **Naming a new fleet-wide secret, endpoint id, or routine id** (queue/scheduler wiring in
  `.claudinite-checks.json` or `.github/workflows/`) — grep the engine for the live convention
  first (e.g. `CCR_*` for scheduler token env vars) rather than inventing a plausible-sounding
  name; an invented name only gets caught and corrected in review anyway.

- **Pushing a change that touches a file `check_the_world.mjs` scans** — that runner is wired into
  CI, not the Stop hook, so nothing runs it locally on its own. Run
  `node .claudinite/shared/engine/checks/check_the_world.mjs` (or the equivalent in-repo path)
  before pushing, rather than waiting for CI to report a finding a few seconds of local run would
  have caught.

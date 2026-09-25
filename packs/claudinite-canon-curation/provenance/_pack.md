## 2026-07-13 · born · Dissolve growth/ into packs: canon-curation (home-only) + grow_with_claudinite (#284)
- **Reason:** growth became fully pack-based and the top-level `growth/` folder went with it, so the
  canon home's own curation duties needed a home of their own.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a pack manifest with `detect: null`, never seeded by `--init` or any migration and
  declared by hand in exactly one repo. Declaration cardinality is what makes its tasks
  central-once: a pack's tasks run per declaring repo, so one declaring repo yields one unit per
  occurrence with no orchestrator step.
- **Landed:** #284 (Closes #281).

## 2026-07-20 · moved · canon-curation moves to local_packs (#361)
- **Reason:** Claudinite-maintaining-Claudinite is project-specific content, so it rides the home's
  own capture surface.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the pack moves from `packs/canon-curation/` to
  `.claudinite/local_packs/canon-curation/`, declared as `local_packs/canon-curation`.
- **Landed:** #361 (Closes #360, Closes #364).

## 2026-09-01 · moved · Promote canon curation into a canon pack (#1541)
- **Reason:** the duties generalize to any repo hosting a shelf of packs, so they belong on the
  shelf rather than in one repo's own tree. Hidden, not seeded by default and without a fingerprint:
  a canon home is a role somebody assigns, so the pack is declared by hand.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack moves to `packs/claudinite-canon-curation/`. Nothing in it names a
  particular canon: the shelf is `packs/` because that is where the engine reads a canon's packs
  from, and the one thing a canon can differ on - a second corpus root beside `packs/` - is the
  optional `write_paths` config.
- **Rejected:** keeping the hardcoded `packs/` plus `skills/` write surface, which matched nothing
  here, and gating the skill check on the engine's own tracked registry, which only the engine's
  home satisfies.
- **Landed:** #1541 (Closes #1537) · pack version 60831.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-07-21 · born · Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384)
- **Reason:** every skill already had exactly one declaring pack, so ownership became placement:
  `<pack>/skills/<skill>/` is the one shape and the manifest's `skills` key, the vendoring skills
  union and the `skill-ownership` check all go with it. This pack is where the git/GitHub side of
  the task lifecycle landed under that rule.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, carrying its content as bundled skills rather than prose;
  universal reach comes from `basics` naming it in `requires`, so the closure materializes it into
  every declaration rather than any repo seeding it directly.
- **Landed:** #384 (Fixes #383, Refs #385) · pack version 1.

## 2026-08-20 · merged · Pack reorganization: two collapses and two renames (#1081)
- **Reason:** the `github-actions` pack held the workflow-YAML rules and the scheduling skill, kept
  apart from the git/GitHub procedure they are the platform half of by a fingerprint that was
  redundant: every `gha/` check already selects its inputs from `.github/workflows/`, so a repo with
  no workflows heard from none of them, and a repo with workflows had to declare a second pack to be
  told so. Nine checks, the skill and the routing moved here; the `gha/` ids stayed as they are,
  because a member's `accept` entries name rules by id and renaming one orphans an acceptance.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest, which carries no fingerprint for the Actions half and does not
  need one; the absorbed id resolves through the engine's rename map and a declaration-converging
  record.
- **Landed:** #1081 (Closes #1079) · pack version 5.

## 2026-08-23 · reworded · Pack manifests by convention: the tree declares the pack (#1248)
- **Reason:** most of what the manifest carried had one correct value, either the one the pack's own
  directory already gave or the one meaning "this pack does not do that", so `id`, `prose`, `badge`,
  `skills`, `worldRules` and `workRules` are resolved from the pack directory and the manifest
  states none of it. `minEngineVersion` rises to the engine release that reads all of it, because a
  manifest with no `id` is dropped outright by a pre-convention engine, which fails the mount
  self-test and stops that member converging at all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1248 (Closes #1246) · pack version 60822.2.

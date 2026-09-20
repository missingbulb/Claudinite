## 2026-08-21 · born · the version belongs to the change, not to the release flow (#1151)
- **Source:** both release standards wrote the version themselves — the extension's daily run patch-bumped and pushed to `main` before packaging — so the version a reviewer saw on a pull request was never the version that shipped, and the one push a pipeline made to `main` unattended was the one that could fail non-fast-forward and strand a release.
- **Reason:** a change touching `ship_paths` raises the manifest version in the same change; the flow ships what it finds on `main` and writes nothing, so create-package no-ops on an already-released version and the store's strictly-higher rule is met by construction.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a work-scope coded check, blocking: the tree always carries a version, so only the diff can say whether it moved with the shipped files beside it, which is why it is not a world-scope check. Gated on the repo shipping the pipeline and scoped by the repo's own `ship_paths` — the same declaration the release config gives the pipeline — so a README, test or workflow edit is free; silent on a change that ships nothing; defers to `cer/version-sync` on an off-scheme version rather than reporting it twice.
- **Rejected:** the pipeline writing the version (the prior state, above).
- **Retire when:** the store stops rejecting a non-higher version and the flow gains an idempotent bump of its own.
- **Landed:** #1151 (Refs #1150) · pack version 60821.1.

## 2026-09-05 · reworded · the header contrasts the canon's own opposite line (#1726)
- **Reason:** a canon pack's version is cut on `main` by the `pack-version-bump` task after the change lands — the opposite rule for a different object, stated so the two are not confused.
- **Actor:** @missingbulb (owner).
- **Landed:** #1726 · pack version 60905.2.

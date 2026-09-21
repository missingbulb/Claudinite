## 2026-08-17 · born · claudinite-dashboard: an opt-in pack for a fleet + per-repo scheduler dashboard (#935)
- **Source:** #934; it supersedes and closes an earlier attempt in the Sheepdog repository.
- **Reason:** nothing converges, runs the scheduler or executes because the dashboard exists, and a
  member that never looks at it should not carry it. Engine code is what every member runs; this is
  content a member opts into, and adoptable content in this corpus is a pack - which also buys it a
  version and migration lane, a declaration that gates it, and an adoption moment at which the
  deploy can be wired. It states none of the queue's vocabulary itself, importing the labels, the
  title grammar, the leash thresholds and the anchor arithmetic from the modules that define them,
  so there is no second copy to drift from the mechanism being rendered - and those relative paths
  resolve identically in the canon and in a member's mount, so the pack reads straight out of the
  mount with nothing rewritten.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the pack manifest, with no fingerprint and no prose - nothing in a repo's shape
  implies wanting a dashboard, and a page is not a practice, so prose here would bill every session
  in every declaring repo for something no session acts on. `.github/workflows/` is the one
  directory the nightly update can never push to, so the deploy workflow arrives by `seedOps` at
  adoption while the build script stays in the pack and keeps converging.
- **Landed:** #935 (Closes #934) · pack version 1.

## 2026-08-19 · reworded · Move fleet-digest to the pack that owns its reader (#1053)
- **Reason:** the task writing the digest series lived in the sheepdog pack, which enumerates the
  fleet, while the only thing that surfaced the series was this page - so producer and reader became
  one adoption. Moved plain, with no config gate, so declaring the pack brought a daily task needing
  a fleet token; without it the work item parks asking for one. The two cross-repo helpers it
  imported were duplicated in trimmed form rather than imported, since two independently-adopted
  packs must not depend on each other.
- **Actor:** @missingbulb (owner).
- **Landed:** #1053.

## 2026-08-30 · reworded · Retire the fleet-digest task and the digests panel (#1397)
- **Reason:** the fleet morning brief was no longer wanted, and the task was gated on no config, so
  as long as it shipped in the pack it wrote the series back every morning. The producer goes, and
  with it the only thing that read its output - keeping the panel would leave a config key promising
  a file nothing writes.
- **Actor:** @missingbulb (owner).
- **Landed:** #1397 (Refs #1392) · pack version 60830.1.

## 2026-09-14 · reworded · Dashboard: move the page's modules under src/, split by layer (#2007)
- **Reason:** the pack kept 33 modules flat at its root beside the page, the schema and the
  manifest: the import graph carried the whole structure - what the browser loads, what is
  node-only, what is pure derivation, what draws DOM - and the folder tree carried none of it. Depth
  stops at one level under `src/`, and everything the browser loads now sits under one directory, so
  the site build decides what to publish by naming `tooling/` rather than by a list of filenames to
  keep in step.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2007 (Refs #2005) · pack version 60913.5.

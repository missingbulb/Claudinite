## 2026-07-18 · born · a member may not reference the mount outside the wiring set (#320)
- **Source:** phase 1 of the vendored-mount design.
- **Reason:** the mount is a tree the vendor writer rebuilds whole, so a reference to it from
  anywhere but the wiring set is a dependency on a file that can vanish under the repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded rule in the `basics` pack composed on the barrier engine, gated on
  `.claudinite/shared/` existing so it is inert in the canon and in every pre-flip consumer, and
  arms per repo as the flip lands.
- **Landed:** #320.

## 2026-08-14 · converted · the isolation wall becomes a declared check here (#839)
- **Reason:** the three fixed barriers were one mechanism with a fixed reference graph, which the
  declared vocabulary's `forbidReferences` carries directly; the scan engine moves into the engine
  helper both the declaration and the per-repo config rule read.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a `forbidReferences` row in this pack's `declared-checks.json`, findings
  byte-identical to the coded rule's apart from the `doc` field a declared check drops.
- **Landed:** #839 (Refs #838).

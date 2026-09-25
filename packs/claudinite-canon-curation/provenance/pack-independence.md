## 2026-07-19 · born · Pack independence: no cross-pack code imports (#348)
- **Source:** a nightly converge that found a member's vendored tree would be incoherent - the
  vendor set omitted `packs/barriers/` while two packs imported from it, so the flipped member would
  crash on the missing import.
- **Reason:** a pack's code imports only its own files and the engine surface; another pack's
  abilities arrive by declaring it and passing configuration.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded check, blocking, resolving imports against the tree. Placed in this pack
  rather than the baseline one because it polices the `packs/` tree, an artifact only a canon home
  has, so a consumer never runs it.
- **Landed:** #348.

## 2026-07-20 · converted · Packs-tree segregation is barriers configuration only (#361)
- **Reason:** the invariant is data, not checking code.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the coded check is retired for a barrier the pack contributes, keeping the same
  rule id so existing acceptances and overrides keep addressing it. Two generic barrier capabilities
  carry it - `siblings` over a folder's direct children, and an `imports` scope that resolves
  relative module edges only, so prose stays free to talk about packs.
- **Rejected:** keeping the code check. A semantics review against the new barrier surfaced five
  real divergences, each fixed red-first, and the barrier was proven live by planting a cross-pack
  import and watching the sweep go red.
- **Landed:** #361 (Closes #360, Closes #364).

## 2026-08-15 · converted · Declarative checks: review document + the implementation it recommends (#839)
- **Reason:** the barrier vocabulary and the declared-check vocabulary were the same idea twice.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a `forbidReferences` declaration in the pack's `declared-checks.json`, over the
  scan engine moved into the engine's check helpers. Findings byte-identical on the home, minus the
  `doc` field a declared check drops.
- **Landed:** #839 (Refs #838).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

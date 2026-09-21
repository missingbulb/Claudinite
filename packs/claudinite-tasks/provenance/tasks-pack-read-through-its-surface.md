## 2026-09-14 · born · claudinite-tasks: roles as folders - src/<role>/, typed world ports, queue/ frozen as ABI (#1890)
- **Source:** link S1 of #1869.
- **Reason:** with every module moved into the role it plays, an import aimed past the published
  surface couples its consumer to a layout this pack is free to change; the surface was narrowed
  from `export *` to named exports in the same change, so reading the queue stopped being public and
  something had to hold that.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a declared check, in `packs/claudinite-canon-curation/declared-checks.json` beside
  the two sibling guards over the same re-layout.
- **Landed:** #1890 (Refs #1869, #1478) · pack version 60914.1.

## 2026-09-15 · moved · Give the tasks pack one public surface, and make it enforceable in members (#2068)
- **Reason:** both halves of the old scope missed the consumers that can get it wrong. Repo-context
  strips every path under the shared mount before any check runs, so that alternative never matched
  a file, and a member has no top-level `packs/` at all - so in every member the rule selected ZERO
  files and read as passing, while `.claudinite/local/packs/**`, the one tree a converge may never
  rewrite, went unscanned. It also lived in a pack no member declares. Run against Shepherd's real
  tree after the widening it reports all five of the deep imports that took its
  fleet-issues-snapshot task to a module-not-found crash, where before it reported none.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the declared check moves to `packs/claudinite-tasks/declared-checks.json`, the pack
  that owns the surface, so every repo declaring claudinite-tasks runs it; its scope takes the
  two-root mount form and widens to `.js`, since the canon's all-ESM habit is not a member's.
- **Landed:** #2068 (Refs #1869) · pack version 60915.9.

## 2026-09-20 · reworded · Restructure the tasks pack's public surface behind shims and collapse its aliases (#2116)
- **Reason:** `src/` now imports the three definition modules out of `public/`, and a canon pack's
  own test may reach `src/` for a test-only name, so both are exempted.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #2116 (Refs #2115) · pack version 60920.1.

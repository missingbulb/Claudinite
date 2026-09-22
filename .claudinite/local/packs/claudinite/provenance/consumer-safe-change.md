## 2026-08-01 · born · Prove a canon change is safe for consumers: self-test, rehearsal, canary, and the rule (#595)
- **Reason:** canon CI proves the canon healthy, which is not evidence about consumers: the canon's
  own packs are always already migrated, so #555 broke every member and passed green.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** check consumer-safe-change, in
  .claudinite/local/packs/claudinite/workRules/consumer-safe-change.mjs.
- **Rejected:** a broad rule over the whole diff - one that cried wolf on every commit gets turned
  off, and is then worth nothing on the day it matters.
- **Landed:** #595 (Closes #593).

## 2026-08-06 · scope-changed · Move engineering-practices from a skill into basics/RULES.md (#661)
- **Reason:** it fired on any changed `.mjs` whose current text says blocking, so editing a
  long-blocking rule's wording or doc pointer raised a migration question the change did not pose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** head compared against base, so a newly-added or newly-promoted rule fires and an
  edit to an already-blocking one does not.
- **Landed:** #661 (Closes #660).

## 2026-08-12 · scope-changed · Versioned updates Phase 1: define the engine release (#776)
- **Reason:** two defects the Phase 0 relocation left: its path pattern still spelled the flat
  `migrations/` directory, so the one escape hatch it offers had silently stopped counting, and it
  demanded a migration record for rules under `.claudinite/local/packs/`, which reach no consumer by
  construction.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** both migration homes counted, and the canon's own local pack excluded; the same
  module under a shipped pack still counts.
- **Landed:** #776 (Refs #768).

## 2026-08-24 · scope-changed · Drop the executor stub's comment about what not to put in it (#1338)
- **Reason:** it blocked a comment deletion in a workflow stub, asking for a migration record or a
  rehearsal fixture. A stub's comments are inert - no member can be carried anywhere by one - so
  that is exactly the cried-wolf firing the rule was narrowed to avoid.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** head and base compared with YAML comments stripped; a `#` opens a comment only at
  line start or after whitespace, and a stub whose head or base cannot be read stays a contract
  surface.
- **Landed:** #1338 (Refs #1331).

## 2026-09-07 · scope-changed · Gate a removed engine or pack export (#1850)
- **Reason:** member local-pack code importing the mount is a real, corpus-encouraged contract that
  nothing treated as one: #1750 removed nine exports and last night's converge delivered an engine
  the fleet enforcer's own local pack could not load. Neither rehearsal can see it - no canary or
  fixture local pack imports an engine module - and an exported symbol was not one of the rule's
  three surfaces.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a fourth surface: a name present in a `.mjs` file's base and absent from its head
  under `engine/**` or `packs/**`, discharged by a re-export shim. Measured before widening: four of
  the sixty most recent first-parent commits would have fired.
- **Landed:** #1850 (Closes #1848).

## 2026-09-15 · scope-changed · Delete the simulator's model: every scenario drives the real queue (H2 of #1869) (#2060)
- **Reason:** it reported rewriting a test helper as a fleet migration.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** narrowed to the vendor set's own `TEST_DIR`.
- **Landed:** #2060 (Refs #1869).

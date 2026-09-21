## 2026-07-20 · born · node: earn-each-dependency check, the testable slice of the engineering-practices rule (#372)
- **Source:** the weekly prose-to-checks sweep over the `engineering-practices` skill's "Earn each
  dependency" rule, a conversion the conversion inventory had already planned.
- **Reason:** only the event has a static signature, a `package.json` gaining a dependency name it
  did not carry at the scoping base, so that converts and the judgment half stays prose with the
  finding pointing back at it. A version bump and a move between dependency groups are not
  additions.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check `node/earn-each-dependency`, advisory, in the work scope so it fires once on
  the branch that adds the name and then converges; homed in the node pack so the pack's own
  declaration gates its relevance, `package.json` being a node artifact.
- **Landed:** #372 (Refs #371) · pack version 1.

## 2026-08-06 · reworded · the finding's doc pointer follows its rule out of the skill (#661)
- **Source:** `engineering-practices` loaded once in 82 captured sessions, so the skill was folded
  into `packs/basics/RULES.md`, which SessionStart injects for every declared pack.
- **Reason:** the judgment half the finding points at is no longer a skill, and the convention is
  that a non-skill doc is named by its repo path.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #661 (Closes #660) · pack version 1.

## 2026-08-18 · born · Tracker docs: a tracker is created in two calls, not with `state: closed` (#953)
- **Reason:** `packs/README.md` was rewritten to state how to count instead of quoting a total, so
  that every pack change stopped having to edit it; a transcribed total is stale at the next pack
  change. The tally tests that pinned the old totals were deleted in the same change.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a clause of the `claudinite` local pack's RULES.md rule on adding or changing a
  check.
- **Landed:** #953 (Refs #951, Refs #960).

## 2026-09-04 · moved · claudinite-canon-curation owns the shelf (#1674)
- **Reason:** everything about the packs on a canon's shelf belongs to the pack that curates it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule moves from the `claudinite` local pack's RULES.md into this pack's
  RULES.md.
- **Landed:** #1674 (Closes #1673) · pack version 60904.1.

## 2026-09-06 · converted · Rules to checks with the four-moment mechanisms (#1779)
- **Reason:** the four-moment mechanisms #1711 landed gave the rule a moment that could carry it, so
  the prose was retired by the deletion test rather than kept beside the check.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check corpus-count-in-prose, in the pack's `declared-checks.json`.
- **Landed:** #1779 (Closes #1760, Refs #1672) · pack version 60906.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

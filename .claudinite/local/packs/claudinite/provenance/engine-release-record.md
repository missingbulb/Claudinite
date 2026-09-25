## 2026-08-12 · born · Versioned updates Phase 1: define the engine release (#776)
- **Reason:** the canary runs in another repository, so no check can verify the run happened - but a
  check can insist the claim is made where a later reader looks, with the run id that settles it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check engine-release-record, in
  .claudinite/local/packs/claudinite/workRules/engine-release-record.mjs.
- **Retire when:** a release artifact the canon can read back directly, rather than a claim about a
  run in another repository.
- **Landed:** #776 (Refs #768).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-08-11 · born · the seed and the enforcer's own declaration must agree (#755)
- **Source:** `store-address-agrees`, proposed in a closed enforcer-side pull request, whose closing
  comment recorded that the check belonged in the canon rather than in a member.
- **Reason:** the seed sweep writes into every member and never overrides, so a wrong seed reaches
  the fleet once and then sticks; correcting it in the enforcer un-writes nothing. Nothing compares
  the two configs at seed time, and a member has no way to know what the enforcer kept for itself.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a blocking check over the enforcer's own declaration, naming no pack, so the pack's
  "it knows no pack by name" design holds. Agreement is exact value equality, because nothing here
  may know what one pack's absent key means.
- **Rejected:** a migration record. The change is additive, so there was no fleet to move across,
  only a shape to prove stays green, and a rehearsal fixture is the honest answer.
- **Landed:** #755.

## 2026-09-22 · policy-changed · one settings-file name, now the rename's window has passed (#1919)
- **Reason:** `.claudinite-checks.json` was read everywhere beside `.claudinite-settings.json` while
  members converged onto the new name, and every reader that asked "is this the declaration" carried
  its own copy of the two-name loop. The convergence window `legacy-shape-in-use` opened has passed,
  so each of those readers now names one file. A member still carrying the retired name reads as
  having no declaration at all - the stated cost of the retirement, and why its policy is nothing.
- **Mechanism:** the reader takes `SETTINGS_FILE` rather than iterating `SETTINGS_FILES`, which is
  now a one-element list kept only as a link-time shim for fielded pack versions (#1911).
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1919

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

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

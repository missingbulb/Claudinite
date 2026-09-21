## 2026-08-13 · declined · folding the fleet sweeps further into one another
- **Source:** the roster merge, which weighed two further merges alongside it.
- **Reason:** `fleet-baseline` plus `fleet-add-missing-packs` as one dispatcher, and
  `fleet-pack-seeds` folded into `fleet-add-missing-packs`, are separate calls with their own
  grounds; the roster merge was taken on the two sweeps that shared a walk and a classification,
  which those pairs do not.
- **Actor:** @missingbulb (owner).

## 2026-08-19 · declined · a preflight probe per token permission
- **Source:** the issue behind the single grant statement asked for one.
- **Reason:** it cannot be accurate where it matters. The permission that was actually missed fails
  only on a private member, so a probe against the enforcer's own repo passes on a grant that later
  403s, and a probe against a private member is the same request the sweep is about to make anyway.
  Attributing a real observed 403 gets the diagnosis without the guess.
- **Actor:** @missingbulb (owner).

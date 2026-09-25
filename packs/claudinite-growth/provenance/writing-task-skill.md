## 2026-09-15 · born · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Source:** #2044, the owner: this pack works on local packs exclusively, its skills stay agnostic
  of their targets, and only a `task.md` says what to work on.
- **Reason:** the prior shape was a `pack_paths` config that widened this pack's sweeps to `packs/`
  in the canon home, which put every run's diff outside its own `under:.claudinite/local` automerge
  policy - PRs #1973 and #1974 both parked on exactly that.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule.
- **Rejected:** the `pack_paths` config, removed from the prose-to-checks skill in the same change.
- **Retire when:** a member ever gains a writable canon.
- **Landed:** #2047 (Closes #2044) · pack version 60915.3.

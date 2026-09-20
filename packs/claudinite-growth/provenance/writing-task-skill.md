## 2026-09-15 · born · converted from references.md (RULES-3)
- **Reason:** #2044, owner: "We actually need the claudinite-growth to make sure it only works on
  local packs. Exclusively. The canon-curation pack should be the only one that touches the packs/
  folder… those skills should focus only on the actions they perform, and be agnostic on their
  targets, and only the task.md should define what to work on." The prior shape was a `pack_paths`
  config that widened this pack's sweeps to `packs/` in the canon home, which put every run's diff
  outside its own `under:.claudinite/local` automerge policy — PRs #1973 and #1974 both parked on
  exactly that.
- **Mechanism:** prose
- **Retire when:** Retire if a member ever gains a writable canon.

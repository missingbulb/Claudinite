## 2026-09-01 · born · converted from references.md (check:gha/label-create-before-add)
- **Reason:** The behaviour: unlike applying an already-defined label, GitHub will not create a
  label on demand, so `gh issue edit --add-label "<name>"` fails when the label does not exist yet.
  What makes it easy to miss in review is the timing — a workflow introducing a new label breaks
  the **first** time it runs, never in the diff. Converted from `git-github-advanced`'s prose in
  #552, which deletes a paragraph whole once a check covers it — the failure message owns the rule
  and the check's own text owns the remedy, so what is recorded here is the platform behaviour the
  check encodes and the condition that would retire it.
- **Mechanism:** a check
- **Retire when:** Reaffirm against `gh`'s behaviour for an undefined label; retire only if
  `--add-label` gains create-on-demand.

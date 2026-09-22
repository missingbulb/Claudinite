## 2026-08-17 · born · holding the fleet PAT (#958)
- **Source:** the pack's RULES.md rewrite from description into instructions.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Granting or repairing FLEET_GITHUB_TOKEN".
- **Landed:** #958 (Closes #954).

## 2026-08-19 · reworded · the grant is stated in one place (#1052)
- **Reason:** the permission list was spelled in seven places, each the subset its own author
  needed, and those strings were the only machine-readable statement of the requirement. A human
  assembling a grant from them landed the union of the subsets and missed a permission only one
  sweep needs, and only on a private member.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1052 (Fixes #1030) · pack version 12.

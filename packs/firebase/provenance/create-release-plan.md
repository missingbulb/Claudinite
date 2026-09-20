## 2026-09-05 · born · converted from references.md (create-release-plan-4): "Commit .firebaserc with named aliases and make the default the safe target"
- **Reason:** The failure is social, not technical: an unqualified `firebase deploy` copied out of a
  README eventually ships someone's half-finished hosting directory to the wrong project. Recovered
  from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule
  rather than enabling it”, before this pack had a references.md to hold it).
- **Mechanism:** a step of the create-release-plan skill, a workflow
- **Retire when:** Reaffirm while `.firebaserc` aliases are the mechanism; retire if the CLI stops
  defaulting to an ambient project.

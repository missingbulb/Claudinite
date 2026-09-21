## 2026-09-06 · born · run the world sweep locally before pushing a config change (#1671)
- **Source:** the reviewed survivors of nine growth-promote pull requests.
- **Reason:** the world sweep runs in CI rather than at the Stop hook, so a finding it reports in
  seconds otherwise costs a push, a CI wait and a fix.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Pushing a change that touches the workflows, the
  declaration or pack config", carrying the literal command.
- **Landed:** #1671 (Refs #1202, #1308, #1408, #1435, #1657, #1672) · pack version 60906.4.

## 2026-09-06 · born · run the world sweep locally before pushing a config change (#1671)
- **Source:** the reviewed survivors of nine growth-promote pull requests.
- **Reason:** the world sweep runs in CI rather than at the Stop hook, so a finding it reports in
  seconds otherwise costs a push, a CI wait and a fix.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Pushing a change that touches the workflows, the
  declaration or pack config", carrying the literal command.
- **Landed:** #1671 (Refs #1202, #1308, #1408, #1435, #1657, #1672) · pack version 60906.4.

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

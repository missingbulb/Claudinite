## 2026-09-03 · born · claudinite-dashboard: move the Pages deploy into a publish-pages task, leaving a four-step workflow (#1664)
- **Source:** #1663.
- **Reason:** the seeded workflow decided for itself when to republish, built the site and carried
  the build's inputs - all of it frozen at adoption in every member, in the one directory the
  nightly update cannot converge. The task owns that now, and the workflow holds only what needs a
  workflow job: a Pages deploy with source "GitHub Actions" needs an Actions artifact and a per-job
  OIDC token, neither of which a `run:` step's subprocess can obtain. What adoption still cannot do
  is enable Pages, so a deploy failing on that parks naming the setting.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a daily agentless task after the lifecycle update, gated on the mount or the
  declaration moving, which builds the site, force-pushes the tree as one root commit, dispatches
  the frozen four-step workflow and follows its run to a terminal state.
- **Landed:** #1664 (Closes #1663) · pack version 60902.15.

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

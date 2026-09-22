## 2026-08-31 · born · Deploy the dashboard's sign-in endpoint from a manual task, verified live (#1465)
- **Source:** #942, the human-only setup carried since the pack was born.
- **Reason:** turning sign-in on needed a serverless function pasted in by hand and three values set
  beside it, which is the step that reliably does not happen - so every deployment still fell back
  to the token box. The run does not report success until the deployed URL answers as that endpoint,
  refusing a stranger's origin and rejecting a request with no code: neither answer comes from
  anything else, so the upload's own 200 is not taken as proof. It does not set the exchange URL,
  because the endpoint is live the moment it deploys while the button appears only once the
  deployment names the URL, so the run prints the exact value instead of editing that file.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a manual agentless task: the endpoint changes when its source, its client secret or
  its allowed origins change, and none of those is a cadence, so nothing instantiates it and the
  only way it runs is a work item somebody creates.
- **Landed:** #1465 (Closes #942) · pack version 60830.1.

## 2026-09-02 · reworded · claudinite-dashboard: a sign-in checklist that can actually be worked (#1591)
- **Reason:** the task's only possible outcome was a park on a secret its owner is not allowed to
  create - GitHub reserves the `GITHUB_` prefix and the secret form refuses it - so the client
  secret is renamed, and no deployment can be carrying the old name, so there is nothing to migrate.
  The checklist beside it was reordered into producer/consumer pairs and matched to the fields the
  App and Cloudflare forms actually ask for, after a reader following it exactly could not create
  the App.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1591 (Refs #1590, #1592, #1594, #1595) · pack version 60902.7.

## 2026-09-15 · reworded · Dashboard: sign-in as the only way in, a GitHub-shaped account menu, and a signal for stale seeded files (#2075)
- **Reason:** the pasted-token provider went, so the endpoint this task deploys is the only route to
  a credential: the fallback existed for a deployment with no OAuth pair configured, which is every
  deployment until somebody sets the two variables, so what a viewer actually met was a page telling
  them to go and mint a personal access token.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #2075 (Refs #2069, #2070, #2071) · pack version 60915.5.

## 2026-09-22 · reworded · print-then-exit swept out of this element (#2225)
- **Reason:** a print immediately before `process.exit()` is discarded when stdout has not drained,
  so the status survived and the output did not; the exit sets `process.exitCode` now and the flow
  returns. No policy moved.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5

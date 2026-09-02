// claudinite-dashboard task: deploy-oauth-exchange — put the dashboard's sign-in
// endpoint live, and prove the deployed URL answers.
//
// `frequency: 'manual'` — nothing recurring is being asked. The endpoint changes
// when its source changes, when the app's client secret is rotated, or when the set
// of page origins allowed to call it changes; none of those is a cadence, so the
// scheduler never instantiates this and the only way it runs is a work item created
// by hand:
//
//   create-work-item claudinite-dashboard/deploy-oauth-exchange
//
// `agent_model: 'none'` — pure code. Read the endpoint's source out of the mount,
// upload it with its bindings, route it, probe it, report the URL.
//
// Self-contained (imports nothing): the whole contract is this default export.

export default {
  id: 'deploy-oauth-exchange',
  frequency: 'manual',
  // Never due on its own: an item exists only because somebody created one, and
  // that IS the request.
  preconditions: ['none'],
  agent_model: 'none',
  // It writes nothing in this repo. The one edit the deployment implies — naming
  // the minted URL as `exchangeUrl` — is the member's own declaration, and the run
  // reports it rather than making it.
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
  // Three API calls and a probe that waits out route propagation (six attempts,
  // five seconds apart). The bound is that probe's worst case with room around it.
  code_work_timeout: 300,
  // The two real credentials, and only those. CLOUDFLARE_API_TOKEN needs one grant to
  // be exercised — Account · Workers Scripts · Edit — on the account hosting the
  // endpoint, every call this task makes being under `/accounts/<id>/workers/`;
  // DASHBOARD_OAUTH_CLIENT_SECRET is the App's client secret. The client id is public and
  // lives in the declaration; the Cloudflare account id is a repository VARIABLE, which
  // every task's code-work is handed with nothing declared, so listing it here would
  // both misstate it as sensitive and put it in a store it does not need.
  //
  // The secret does NOT share the `CLAUDINITE_DASHBOARD_` prefix of its sibling
  // variables, and cannot: `GITHUB_` is refused by the secret form outright, and
  // `CLAUDINITE_` is the code-work contract's own namespace, where a task file naming
  // one is read as a variable nobody sets (`task-code-work-env`).
  required_secrets: ['CLOUDFLARE_API_TOKEN', 'DASHBOARD_OAUTH_CLIENT_SECRET'],
};

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
  precondition_signals: [],
  agent_model: 'none',
  // It writes nothing in this repo. The one edit the deployment implies — naming
  // the minted URL as `exchangeUrl` — is the member's own declaration, and the run
  // reports it rather than making it.
  expected_outcome: 'none',
  code_work: 'node worker.mjs',
  // Three API calls and a probe that waits out route propagation (six attempts,
  // five seconds apart). The bound is that probe's worst case with room around it.
  code_work_timeout: 300,
  // The three things a public declaration must not carry. CLOUDFLARE_API_TOKEN
  // needs exactly one grant — Account · Workers Scripts · Edit — on the account
  // that hosts the endpoint; GITHUB_OAUTH_CLIENT_SECRET is the App's client secret,
  // and its client id is public and lives in the declaration instead.
  required_secrets: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'GITHUB_OAUTH_CLIENT_SECRET'],

  // Never due on its own: an item exists only because somebody created one, and
  // that IS the request. A `false` here would close the operator's own item without
  // running it, with no anchor to roll to.
  precondition() {
    return { run: true, reason: 'a work item for this manual lever exists, which is the request to deploy' };
  },
};

# deploy-oauth-exchange

Puts the dashboard's sign-in endpoint — [`oauth-exchange.mjs`](../../oauth-exchange.mjs)
— live on Cloudflare Workers, and does not report success until the deployed URL
answers as that endpoint.

The task runs no agent: `worker.mjs` invokes [`deploy.mjs`](deploy.mjs), which is
also the hand-runnable script (`node deploy.mjs --root <member> [--dry-run]`).

## What it needs

| Where | Name | What it is |
|---|---|---|
| Repo Actions secret | `CLOUDFLARE_API_TOKEN` | a token reaching **Account · Workers Scripts · Edit** on the hosting account. The deploy calls three endpoints and all three are `/accounts/<id>/workers/…`, so its **Zone Resources** are never exercised whatever they are set to |
| Repo **variable** | `CLOUDFLARE_ACCOUNT_ID` | the Cloudflare account the endpoint is hosted on. Not a secret — it is in every dashboard URL its owner opens — and since #1494 the executor hands every repository variable to code-work with nothing declared |
| Repo Actions secret | `DASHBOARD_OAUTH_CLIENT_SECRET` | the GitHub App's client secret |
| Repo **variable** | `CLAUDINITE_DASHBOARD_CLIENT_ID` | the App's client id — public, and the same value the page's own build reads, through one shared reader so the two cannot diverge |
| Declaration `config` | `allowedOrigins` | *optional*; the exact page origins allowed to call the endpoint. Falls back to `redirectUri`'s origin, then to `https://<owner>.github.io` |
| Declaration `config` | `workerName` | *optional*; defaults to `claudinite-oauth-exchange` |

## What a run does

1. Resolves the client id and the allowed origins, refusing to guess either.
2. Reads the account's `workers.dev` subdomain — the URL's second label.
3. `PUT`s the script with its three bindings. The binding set is declarative and
   replaces what was there, so a rotated secret leaves no stale copy behind.
4. Enables the `workers.dev` route, with previews off: a preview URL would be a
   second origin able to mint tokens.
5. Probes the URL twice — a stranger's origin must be refused `403
   origin_not_allowed`, the allowed origin with no code must get `400 missing_code`
   — retrying while the route propagates. Only those two answers show the route is
   live, the handler is this one, and the allowlist is the one just uploaded.
6. Reports the URL, and whether `CLAUDINITE_DASHBOARD_EXCHANGE_URL` already names it.

Re-running is a redeploy to the same URL: the upload is a whole-script `PUT` and
there is no state to reconcile. Rotating the client secret means running it again.

## What it deliberately does not do

**It does not set `exchangeUrl`.** The endpoint is live the moment it deploys, but
the Sign in button appears only once the declaration names it, and that is an edit
to the member's own `.claudinite-settings.json`. The run prints the exact value.

## Why the declaration reads as it does

Carried over from the declaration's comments when it became `task.json`.

claudinite-dashboard task: deploy-oauth-exchange — put the dashboard's sign-in
endpoint live, and prove the deployed URL answers.

`frequency: 'manual'` — nothing recurring is being asked. The endpoint changes
when its source changes, when the app's client secret is rotated, or when the set
of page origins allowed to call it changes; none of those is a cadence, so the
scheduler never instantiates this and the only way it runs is a work item created
by hand:

  create-work-item claudinite-dashboard/deploy-oauth-exchange

`agent_model: 'none'` — pure code. Read the endpoint's source out of the mount,
upload it with its bindings, route it, probe it, report the URL.

Never due on its own: an item exists only because somebody created one, and
that IS the request.
It writes nothing in this repo. The one edit the deployment implies — naming
the minted URL as `exchangeUrl` — is the member's own declaration, and the run
reports it rather than making it.
Three API calls and a probe that waits out route propagation (six attempts,
five seconds apart). The bound is that probe's worst case with room around it.
The two real credentials, and only those. CLOUDFLARE_API_TOKEN needs one grant to
be exercised — Account · Workers Scripts · Edit — on the account hosting the
endpoint, every call this task makes being under `/accounts/<id>/workers/`;
DASHBOARD_OAUTH_CLIENT_SECRET is the App's client secret. The client id is public and
lives in the declaration; the Cloudflare account id is a repository VARIABLE, which
every task's code-work is handed with nothing declared, so listing it here would
both misstate it as sensitive and put it in a store it does not need.

The secret does NOT share the `CLAUDINITE_DASHBOARD_` prefix of its sibling
variables, and cannot: `GITHUB_` is refused by the secret form outright, and
`CLAUDINITE_` is the code-work contract's own namespace, where a task file naming
one is read as a variable nobody sets (`task-code-work-env`).

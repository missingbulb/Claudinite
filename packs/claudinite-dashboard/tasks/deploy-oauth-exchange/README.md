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

# cloudflare-pages pack

Active when the repo carries a near-root Wrangler config declaring a static-assets binding, or a
tracked source file invoking `wrangler pages deploy`.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Decide Pages project vs. Worker assets up front | medium | correctness | prose: 88 words |
| A Worker static-assets binding needs `.assetsignore` | medium | correctness | prose: 61 words |
| A custom domain is declared, not provisioned | medium | correctness | prose: 84 words |
| Classify a failed `wrangler deploy` | medium | complexity | prose: 76 words |
| Pin the `wrangler` version an automated deploy runs | low | correctness | prose: 32 words |

Provenance: distilled from two fleet members each shipping a static site through Cloudflare.

| Member | What it evidenced |
|---|---|
| `missingbulb/ClaudiniteWebsite` | `wrangler.json` (a Worker's `assets.directory` binding, `workers_dev: false`, and `routes` naming `custom_domain: true` for two hostnames), `site/.assetsignore` and `site/README.md`'s own "Custom domain" section (Cloudflare minting the DNS record and certificate on attach), and its own site-release task worker (`isOperatorFailure`'s numeric-code/phrase classification of a failed `wrangler deploy`, and its pinned `WRANGLER` version rather than a floating range) |
| `missingbulb/hitbut` | `wrangler.toml`'s own comment marking the front end as "a separate Pages project" from the Worker backend, and `dev/tools/deploy.ts` (`wrangler pages deploy … --project-name … --branch main`, reading the production origin back from `wrangler pages project list --json` rather than the deploy's own per-deployment alias) |

Every rule above traces to a real, committed config or script in at least one member — not to
prose alone.

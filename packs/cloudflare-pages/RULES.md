# Cloudflare Pages

A default to adapt, not a contract. Covers shipping a **static site** to Cloudflare, whether as a
dedicated Pages project or as a Worker's own static-assets binding, through Wrangler.

- **Decide which of the two static-hosting shapes you're building, up front — they deploy and
  read back differently.** A **Pages project** ships with `wrangler pages deploy <dir>
  --project-name <name>` and its production hostname comes back from `wrangler pages project
  list --json`; a **Worker's static-assets binding** (an `assets` block in the Wrangler config,
  no separate project) ships with the ordinary `wrangler deploy` and reads back the same way any
  Worker does. Building half of one and half of the other is how a "deploy the site" step ends up
  calling the wrong command for what actually shipped.

- **A Worker's static-assets binding needs its own ignore file.** `.assetsignore`, matched
  against the `assets.directory` the config names, holds back anything under that directory that
  rides along for other reasons (a README, the config itself) but isn't a page to serve — the
  same purpose `.gitignore` serves for git, and just as easy to forget until an upload ships a
  file nobody meant to publish.

- **A custom domain is declared, not provisioned.** Naming a hostname as a `routes` entry with
  `custom_domain: true` (or a Pages project's own custom-domain setting) is the whole step —
  Cloudflare creates the DNS record and issues the certificate itself the moment the deploy
  attaches it. Once a custom domain is live, turn off the default alias (`workers_dev: false` for
  a Worker) so the auto-generated `*.workers.dev`/`*.pages.dev` address stops being a second,
  unlisted way to reach the same site.

- **Classify a failed `wrangler deploy` before deciding who it belongs to.** Cloudflare's own
  authentication/authorization/zone failures carry a recognisable signature — a numeric error
  code (`10000`, `10001`, `10021`, …) or phrases like "authentication error", "not authorized",
  "no such zone" — and are the one class a human fixes in seconds (a token missing a scope, the
  wrong account id, a domain that isn't actually a zone on this account yet). Match that
  signature and hand a person the specific thing to check; anything else is a real failure and
  the trace is the answer.

- **Pin the exact `wrangler` version an automated deploy runs**, not a floating range — an
  unattended release that silently changes its own toolchain between two runs is a change nobody
  reviewed.

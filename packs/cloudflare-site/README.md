# cloudflare-site pack

Active when a near-root `wrangler.json`/`.jsonc` declares `assets.directory` — a repo whose
wrangler config describes a *site* rather than a Worker backend. It brings the nightly
`site-release` task (cut the version, stamp the pages, push the bump, upload the tree, report
what the domain answered), the version scheme itself, and the checks that keep the upload
boundary, the version stamp, the beacon token and the single path to production honest.

The Cloudflare account's own steps — the zone, the account id, the API token — are the pack's
`adoptionHandover`, filed as a tracking issue when the pack is adopted. What a previous host
left behind is **not** on that list: an inherited DNS record on a claimed hostname is resolved
in public DNS by the release before it consumes a version number, and a workflow or `CNAME` file
still publishing is a check's finding. A checklist of steps that are no-ops for most adopters
teaches its reader to skim it.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Only the published tree reaches the site | high | correctness | prose: 54 words |
| The version stamp is generated, never typed | medium | correctness | prose: 45 words + check (`cloudflare-site/version-stamp-matches-package`) |
| One path to production | high | correctness | prose: 47 words + check (`cloudflare-site/no-second-publisher`) |
| What a parked release is asking for | medium | correctness | prose: 59 words |

## Skills

| Skill | Trigger |
|---|---|
| [`releasing-a-cloudflare-site`](skills/releasing-a-cloudflare-site/SKILL.md) | any edit of a `wrangler.json`/`.jsonc` or the release task — held by the guard until loaded |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `cloudflare-site/publishes-a-site-directory` | critical | correctness | check: blocking |
| `cloudflare-site/version-stamp-matches-package` | medium | correctness | check: blocking |
| `cloudflare-site/no-second-publisher` | high | correctness | check: blocking |
| `cloudflare-site/beacon-token-is-not-committed` | high | legal | check: blocking |

## Tasks

| Task | Cadence | What it does |
|---|---|---|
| [`site-release`](tasks/site-release/README.md) | daily, when the branch has moved past the last release | cuts the next version, stamps and pushes it, uploads the published tree to Cloudflare |

## Upstream

- Cloudflare Workers static assets and custom domains —
  https://developers.cloudflare.com/workers/static-assets/ and
  https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ — reconciled
  against the documentation as of 2026-09-13.
- Wrangler releases — https://github.com/cloudflare/workers-sdk/releases — the release pins
  `wrangler@4.128.0`; the pin moves in a commit that says so.

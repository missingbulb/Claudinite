# cloudflare-workers pack

Active when the repo carries a Wrangler config (`wrangler.toml`/`.json`/`.jsonc`) at the root or
one directory down.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Route large uploads through R2 | high | correctness | prose: 61 words |
| A Workflow step passes a key | high | correctness | prose: 87 words |
| Size a Workflow step by CPU | high | correctness | prose: 58 words |
| Native work needs a Container | high | correctness | prose: 52 words |
| Migrations need three merges | critical | correctness | prose: 98 words |
| Fix the embedding model first | high | correctness | prose: 44 words |
| Distinguish absent from unknown | high | correctness | prose: 62 words |
| A deploy URL is not production | medium | correctness | prose: 54 words |
| Test through fakes, not bindings | medium | complexity | prose: 63 words |
| Sign R2 requests like S3 | medium | correctness | prose: 48 words |
| Cloudflare docs have a mirror | low | complexity | prose: 59 words |

## Upstream

Where the platform this pack describes publishes its own changes, and the state this pack's
guidance has been reconciled against. The canon's `upstream-watch` reads this section; a member
repo reads nothing here.

- **Cloudflare Docs** (Workers, D1, R2, Vectorize, Workflows, Workers AI platform/limits pages)
  — https://developers.cloudflare.com/ (mirrored as source at
  `raw.githubusercontent.com/cloudflare/cloudflare-docs`, `production` branch, under
  `src/content/docs/<product>/platform/limits.mdx`) — reconciled through 2026-09-06, against the
  request-body, D1, R2, Vectorize dimension-immutability, and Workflow step-result-size limits
  this pack's rules cite.

Provenance: distilled from two fleet members each shipping a Cloudflare Workers backend.

| Member | What it evidenced |
|---|---|
| `missingbulb/hitbut` | `dev/gates/schema-migrations.ts` + `.test.ts` (the expand/migrate/contract hazard classifier, keyed on `-- expand:`/`-- contract-of:` markers), `dev/tools/cloudflare.ts` + `dev/gates/provisioning.test.ts` (the present/missing/unknown split, and the Vectorize dimension refusal), `dev/tools/origins.ts` (reading a Pages/Worker production hostname off the platform's own listing rather than a deploy's per-deployment alias), and `docs/architecture/DESIGN.md` (one Worker + one Workflow over D1/R2/Vectorize, bindings touched from a single module) |
| `missingbulb/WIP` (`backend/`) | `backend/package.json` + `dev/design/architecture.md` (the Worker request-body cap routed around via a presigned R2 PUT validated after the upload-complete callback, the Workflow step-result cap and its per-step-CPU-vs-unlimited-wall-clock budget, the Workers-runtime-can't-run-native-binaries boundary with a Container carrying ffmpeg as its one job, `aws4fetch` signing the R2 presigned PUT, and its own local pack recording the `developers.cloudflare.com` egress block and its `raw.githubusercontent.com/cloudflare/cloudflare-docs` mirror) |

Every rule above is backed by at least one member's real, working code or its own coded gate —
the D1 migration discipline and the missing/unknown provisioning split each ride a committed
test, not narrative alone.

# cloudflare-workers pack

Active when the repo has a `wrangler.toml`/`.jsonc`/`.json` at the root or one directory down.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Deploy applies schema before code | critical | correctness | prose: 83 words |
| Choose the storage primitive by pattern | medium | correctness | prose: 68 words |
| Hand-declare bindings, skip published Workers types | high | correctness | prose: 88 words |
| Test against real workerd, committed config | high | correctness | prose: 172 words |
| Seed test D1 from shipped migrations | high | correctness | prose: 55 words |
| Local emulation doesn't prove real service | high | correctness | prose: 102 words |
| Tell missing apart from unknown | medium | correctness | prose: 94 words |

Provenance: distilled from `missingbulb/hitbut` (a Cloudflare Worker + D1 + R2 + Vectorize
backend, `src/backend/`, its `dev/requirements/server/` test lane, and `dev/tools/preflight.ts` /
`smoke.ts`), the first fleet member seen on Cloudflare Workers.

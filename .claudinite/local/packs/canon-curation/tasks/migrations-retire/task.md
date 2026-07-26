# Migrations — archive records past their TTL

**This task runs no agent.** It is `agent_model: none` with `agent_preprocessing: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess. This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## What it does

Every migration record whose age has passed the **7-day TTL** (since its `landed` date) moves from `migrations/active_migrations/` to the canon-only `migrations/migrations-old/` archive, delivered as **one PR**. No fleet enumeration, no fleet PAT — the decision is a pure age comparison over the canon's own records (`migrationsPastTtl` in `migrations/registry.mjs`, unit-tested there).

## Archival, not deletion

Moving a record to `migrations-old/` keeps it working — it is **not** a delete:

- **It still applies.** `loadMigrations()` reads **both** folders, so a **dormant project** — one that fell behind and only now baselines — still gets an aged migration applied when baselining converges its mount out of a fresh canon clone. The archive is the durable backfill source for the long tail.
- **It stops shipping.** The archive is **canon-only** — the vendored consumer mount ships only `active_migrations/`. A project up to speed on migrations therefore carries few-to-none of these locally; it already applied them within the TTL window.
- **Its check-tolerance ends.** `migrationActive()` scans only `active_migrations/`, so a migration's legacy-shape tolerance ends when it ages out — every up-to-date repo converged within the TTL, and a dormant one is converged by the apply pass *before* its checks run.

## Delivery

The move is staged on a stable `claudinite/archive-migrations` branch and delivered as one PR (amended in place across runs) over the Action's `GITHUB_TOKEN` — the canon's own CI validates the move before it lands. Because the record still applies from its new home, the move is behavior-preserving; the PR is safe to merge once green.

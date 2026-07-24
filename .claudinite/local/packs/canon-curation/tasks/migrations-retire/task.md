# Migrations — retire converged migrations (the fleet finalization pass)

**This task runs no agent.** It is `agent_model: none` with `agent_preprocessing: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess. This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent to read it.

## What it does

Over every covered member (enumerated over `FLEET_GITHUB_TOKEN`), it probes each active migration's `legacyPresent`, then **retires** any migration that is both **fully applied** (zero members still carry its legacy shape) and **quiescent** (the whole fleet has demonstrably converged past it). Retirement deletes the migration record plus the now-unused canon files the migration had vendored into consumers.

## Quiescence — per-repo stamps, strictly conservative

Retirement is **irreversible**, so the guard ([`retirableMigrationsByStamp`](/migrations/registry.mjs), unit-tested there) is conservative on every axis. A migration retires only when **all** hold:

- it opts into auto-retirement (`retire !== 'manual'`);
- the fleet picture is **complete** — no member's declaration was unreadable this run, and every member carries a provenance stamp (either gap makes the count "unknown", which blocks **all** retirement: a member we can't place could still be on a legacy shape);
- **zero** members still carry its legacy shape;
- it landed strictly before today (≥ one cycle old); and
- **every** member's provenance stamp is dated strictly after it landed — the per-repo quiescence proof. Each member's own baselining advances its stamp when it converges its mount; a stamp later than the migration's landing day means that member has already seen the migration (applied it or found it inapplicable) and is not mid-application. A single member that hasn't converged past the landing day blocks retirement until the whole fleet catches up.

This replaces the old central pass's in-memory *applied-this-cycle* handoff (there is no central apply pass in the per-repo model — each member applies its own notes).

## Delivery — one CI-gated PR, never auto-merged

Retirement is staged on a stable `claudinite/retire-migrations` branch and delivered as **one PR against the canon's default branch, never auto-merged** (amended in place across runs). The canon's own CI — `barriers`, `reference-integrity`, the test suite — then validates that the deletion strands no inline reference before it can land: a clean retirement is a green, mergeable PR; a stranding one is a red PR held for a human to clean up the references it exposed. So `main` never goes red from a retirement, and even an imperfect quiescence call at worst opens a reviewable PR — never a destructive direct delete.

## Tokens

Cross-repo reads use `FLEET_GITHUB_TOKEN` (the census's credential — the only token that sees every member). The canon PR is written over the Action's `GITHUB_TOKEN` (widened to `contents` + `pull-requests` write for scheduler delivery). Without `FLEET_GITHUB_TOKEN` the worker cannot enumerate the fleet to prove quiescence, so it logs and no-ops (retirement is optional cleanup, not a per-run failure).

#!/usr/bin/env node
// COMPATIBILITY ENTRY POINT — the applier moved to engine/migrations/apply.mjs
// with the engine/pack split (docs/versioned-updates/DESIGN.md §3.7). This path
// stays because it is the one every member INVOKES BY PATH: baselining's worker
// runs `node <fresh canon clone>/migrations/apply.mjs`, and that worker is the
// member's own vendored copy, as new as its last successful converge — never as
// new as this tree. Deleting the path outright would fail the apply step of every
// converge running an older worker, which is the converge that would have
// delivered the newer one: the mount never advances, so the fix can never arrive
// (#652's deadlock, one directory over).
//
// It retires when no member can still call it — Phase 5, after the fleet has
// updated through the new flows. Nothing new should import it.
import { main } from '../engine/migrations/apply.mjs';

main().catch((e) => { console.error(`migrations apply failed: ${e.message}`); process.exit(1); });

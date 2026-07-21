// The engine-tree restructure: the whole engine now lives under engine/ as one
// copyable folder — checks/ -> engine/checks/, mount/ -> engine/mount/, and the
// pack/skill machinery .mjs from the packs//skills/ roots -> engine/packs/,
// engine/skills/ — with tests and per-pack maintainer notes structurally apart
// (engine-tests/, packs-tests/, skills-tests/). The vendored tree mirrors the
// canon layout, so the nightly convergence moves a member's .claudinite/shared/
// content on its own; what does NOT move on its own are the member's OWN copies
// of engine paths, rewritten in place here:
//   - .claude/settings.json hook registrations (SessionStart/Stop/PreToolUse),
//     both the vendored-mount shape (.claudinite/shared/...) and the legacy
//     fetch-mount shape (.claudinite/checks/..., .claudinite/mount/... — their
//     synced corpus mirrors the canon, so it too gains the engine/ layer);
//   - the CI stub workflow's runner invocation.
//
// The old entry points keep working throughout the transition: the canon
// carries shims at checks/stop-hook.mjs, checks/pretooluse-guard.mjs, and
// mount/session-start.sh that forward into engine/, so a legacy member syncing
// the restructured tarball before this rewrite lands is never broken, and the
// legacy sync hook's fan-out tries the engine path first with the shim as
// fallback. (Vendored members can't skew: the same nightly PR that rewrites
// their settings also converges their shared/ tree.)
//
// Out-of-repo state: the pasted web-environment Setup script of a FLIPPED
// member invokes `node .claudinite/shared/packs/env.mjs install` — that path is
// now engine/packs/env.mjs and is not vendored at the old location, so the
// paste fails fast at the next environment rebuild. As with the flip itself,
// the fix is a member issue asking to re-paste the member's own
// `.claudinite/shared/engine/mount/environment-setup.sh` — the baselining
// worker opens it when it converges a flipped member past this note (search
// first, idempotent; the flip note's step 3 is the template).
//
// retire: 'manual' — retiring must also delete the three shims from the canon
// (checks/stop-hook.mjs, checks/pretooluse-guard.mjs, mount/session-start.sh),
// drop the legacy fallbacks from engine/mount/sync-claudinite.sh's fan_out and
// from CANON_MEMBER_PATHS in routines/fleet/signals.mjs, and prune the shim
// mention from bootstrap.md's transition appendix — a deliberate change beyond
// deleting this record.
export default {
  id: 'engine-tree-restructure',
  landed: '2026-07-21',
  summary: 'engine consolidated under engine/ (checks/, mount/, pack/skill machinery); consumer-held hook/CI paths rewritten in place',
  // Telemetry: a member whose default branch still tracks the pre-restructure
  // vendored engine layout has not converged past this note yet.
  legacyPresent: async (exists) => exists('.claudinite/shared/checks/run.mjs'),
  retire: 'manual',
  // Never the canon itself: only repos that actually hold a Claudinite mount —
  // the vendored tree or the legacy tracked sync hook.
  appliesTo: async (read) =>
    (await read('.claudinite/shared/CLAUDE.md')) != null ||
    (await read('.claudinite/mount/sync-claudinite.sh')) != null,
  rewrite: [
    {
      file: '.claude/settings.json',
      replace: [
        // vendored-mount wiring
        { from: '.claudinite/shared/mount/session-start.sh', to: '.claudinite/shared/engine/mount/session-start.sh' },
        { from: '.claudinite/shared/checks/stop-hook.mjs', to: '.claudinite/shared/engine/checks/stop-hook.mjs' },
        { from: '.claudinite/shared/checks/pretooluse-guard.mjs', to: '.claudinite/shared/engine/checks/pretooluse-guard.mjs' },
        // legacy fetch-mount wiring (the synced corpus mirrors the canon, so
        // the canonical target gains the engine/ layer; the sync hook's own
        // registration at .claudinite/mount/sync-claudinite.sh is a
        // consumer-side location and does not move)
        { from: '.claudinite/checks/stop-hook.mjs', to: '.claudinite/engine/checks/stop-hook.mjs' },
        { from: '.claudinite/checks/pretooluse-guard.mjs', to: '.claudinite/engine/checks/pretooluse-guard.mjs' },
      ],
    },
    {
      file: '.github/workflows/claudinite-checks-ci.yml',
      replace: [
        { from: '.claudinite/shared/checks/run.mjs', to: '.claudinite/shared/engine/checks/run.mjs' },
      ],
    },
  ],
};

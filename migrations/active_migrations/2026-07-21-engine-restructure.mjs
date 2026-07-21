// The engine restructure (#385): everything engine-owned consolidates under
// engine/ — engine/hooks/ (the wired *-command entry points + steps/),
// engine/checks/ (check_the_world.mjs — was checks/run.mjs — and
// check_the_work.mjs — was checks/stop-hook.mjs — with helpers/, was
// checks/lib/), engine/pack_loader/ and engine/skill_loader/ (the packs/ and
// skills/ root machinery), engine/vendoring/ (was mount/). A member's vendored tree picks
// the new layout up whole-set on its nightly convergence; this note carries the
// one thing convergence can't reach — the member's own wiring files naming the
// old paths.
//
// Pre-flip members need no settings rewrite: their frozen wiring points at the
// fetched tree's old paths, which the canon keeps as forwarding TRANSITION
// SHIMS (checks/stop-hook.mjs, checks/pretooluse-guard.mjs,
// mount/session-start.sh, packs/env.mjs) until this note retires — the flip
// converts their wiring wholesale when their turn comes.
//
// retire: 'manual' — the shims above and this note retire together, by hand,
// once every flipped member's settings are rewritten and every environment's
// pasted Setup script is re-pasted (the out-of-repo state no commit reaches).
export default {
  id: 'engine-restructure',
  landed: '2026-07-21',
  summary: 'engine consolidates under engine/ — hooks, loaders, check_the_world/check_the_work, checks_helpers, mount (#385)',
  // A flipped member still pointing its hooks at the old shared/ paths.
  legacyPresent: async (exists) => exists('.claudinite/shared/checks/stop-hook.mjs'),
  retire: 'manual',
  rewrite: [
    {
      file: '.claude/settings.json',
      replace: [
        {
          from: '.claudinite/shared/mount/session-start.sh',
          to: '.claudinite/shared/engine/hooks/session-start-command.sh',
        },
        {
          from: '.claudinite/shared/checks/stop-hook.mjs',
          to: '.claudinite/shared/engine/hooks/stop-command.mjs',
        },
        {
          from: '.claudinite/shared/checks/pretooluse-guard.mjs',
          to: '.claudinite/shared/engine/hooks/pretooluse-command.mjs',
        },
      ],
    },
  ],
};

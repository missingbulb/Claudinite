// The first migration recorded in the framework: the Method B sync hook's move
// from .claude/hooks/sync-claudinite.sh into .claudinite/sync-claudinite.sh
// (#211/#213). It declares the path aliases the resolver serves and the legacy
// shape the census probes for fleet telemetry.
//
// retire: 'manual' — deliberately NOT auto-retired yet. This relocation's
// tolerance still lives inline in several places (sync-claudinite.sh's tracked-
// copy fallback, the census's `.claudinite/.gitkeep` coverage check,
// bootstrap.md Part 3b). Deleting this record is only safe once those readers
// consult resolvePath() instead — the tracked follow-up. Until then this is a
// declarative record + fleet telemetry, retired by hand. Flip to 'auto' in the
// same change that wires the last inline tolerance to the resolver.
export default {
  id: 'sync-hook-relocation',
  landed: '2026-07-12',
  summary: 'Method B sync hook moved from .claude/hooks/sync-claudinite.sh into .claudinite/sync-claudinite.sh (#211/#213)',
  aliases: [
    { canonical: '.claudinite/sync-claudinite.sh', legacy: ['.claude/hooks/sync-claudinite.sh'] },
  ],
  // A repo is still on the legacy shape iff either pre-relocation marker survives
  // on its default branch — the old hook path, or the retired `.gitkeep` marker.
  // `exists(path)` resolves truthy when the path is present in the repo.
  legacyPresent: async (exists) =>
    (await exists('.claude/hooks/sync-claudinite.sh')) || (await exists('.claudinite/.gitkeep')),
  retire: 'manual',
};

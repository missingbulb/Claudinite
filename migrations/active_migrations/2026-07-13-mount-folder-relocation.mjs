// The mount-folder relocation: the Method B sync hook, the SessionStart
// orchestrator, and the cloud env-setup script were bundled from the Claudinite
// repo root into mount/, so a consumer's tracked hook moves
//   .claudinite/sync-claudinite.sh  ->  .claudinite/mount/sync-claudinite.sh  (#275)
//
// This record SUPERSEDES the earlier sync-hook-relocation (#211/#213): its
// endpoint, .claudinite/sync-claudinite.sh, is now itself a legacy shape, so the
// full chain of prior sync-hook locations is folded into `legacy` here — a repo on
// ANY earlier shape moves straight to the mount/ path.
//
// retire: 'manual' — the read-side tolerance still lives inline (fleet-api's
// isCovered probe accepts both shapes; sync-claudinite.sh preserves the pre-mount
// tracked copy across its swap; bootstrap.md's convergence steps git-mv it and
// rewrite the settings/gitignore). Deleting this record alone would strand those.
// Flip to 'auto' in the same change that wires the last reader to resolvePath().
export default {
  id: 'mount-folder-relocation',
  landed: '2026-07-13',
  summary: 'sync hook + session-start orchestrator + env-setup bundled into .claudinite/mount/ (#275)',
  aliases: [
    {
      canonical: '.claudinite/mount/sync-claudinite.sh',
      legacy: ['.claudinite/sync-claudinite.sh', '.claude/hooks/sync-claudinite.sh'],
    },
  ],
  // A repo is still on a pre-mount shape iff any prior sync-hook location — or the
  // retired legacy `.gitkeep` marker — survives on its default branch.
  legacyPresent: async (exists) =>
    (await exists('.claudinite/sync-claudinite.sh')) ||
    (await exists('.claude/hooks/sync-claudinite.sh')) ||
    (await exists('.claudinite/.gitkeep')),
  retire: 'manual',
};

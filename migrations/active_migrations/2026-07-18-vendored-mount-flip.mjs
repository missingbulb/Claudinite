// The vendored-mount FLIP (mount/DESIGN.md, phase 2): convert a member from the
// legacy fetch-at-session-start mount to the tracked vendored mount — one commit
// per member, applied by the nightly BASELINING WORKER, never by the mechanical
// fleet-apply pass. Deliberately no aliases/materialize/rewrite ops: the
// conversion needs the member's own declaration to compute its vendor set, so
// it runs through the worker (apply-vendor.mjs doing the mechanical core); the
// mechanical passes see this record as a no-op, and the retire pass reads its
// telemetry.
//
// GATED PILOT: `flip.repos` names the only members the worker may convert.
// Widening after a clean pilot night is a one-line change: set it to 'fleet'.
export default {
  id: 'vendored-mount-flip',
  landed: '2026-07-18',
  summary: 'legacy fetch-at-session-start mount -> tracked vendored mount at .claudinite/shared/ (one commit per member; mount/DESIGN.md phase 2)',
  // Telemetry: a member still carrying the tracked sync hook is unflipped.
  legacyPresent: async (exists) => exists('.claudinite/mount/sync-claudinite.sh'),
  // Phase 3 is a deliberate change beyond deleting this record — the canon's
  // sync hook, bootstrap's transition appendix, and the worker's legacy branch
  // all retire together, by hand — so never auto-retire.
  retire: 'manual',
  flip: {
    repos: ['missingbulb/GoogleCalendarEventCreator'], // 'fleet' = every covered member
    steps: `
## Converting one member (the baselining worker follows this verbatim)

**Preconditions** — idempotent: the member is pre-flip (tracked
\`.claudinite/mount/sync-claudinite.sh\` present, no \`claudinite\` stamp in its
\`.claudinite-checks.json\`). Already flipped, or not named by \`flip.repos\`
(unless it is 'fleet') -> do nothing.

**1. Build the member's vendor tree locally** (the fleet session runs in the
canon checkout with a shell): make a scratch dir; write the member's fetched
\`.claudinite-checks.json\` into it; replicate any member
\`.claudinite/local_packs/*/pack.mjs\` files at the same paths (their skills
lists feed the set); run
\`node mount/apply-vendor.mjs --target <scratch> --ref <canon head sha>\`.
The scratch now holds \`.claudinite/shared/**\` and the stamped declaration.

**2. Land ONE commit** on the member (delivery-aware: \`push\` -> default
branch; \`pr\` -> the maintenance branch/PR), containing exactly:
- every \`scratch/.claudinite/shared/**\` file, same paths;
- the stamped \`.claudinite-checks.json\` from the scratch;
- \`.claude/settings.json\` edited in place (never touching the member's own
  entries): the SessionStart sync-hook command becomes
  \`bash $CLAUDE_PROJECT_DIR/.claudinite/shared/mount/session-start.sh\`; the
  Stop/PreToolUse commands repoint \`.claudinite/checks/\` ->
  \`.claudinite/shared/checks/\`;
- \`CLAUDE.md\`: \`@.claudinite/CLAUDE.md\` -> \`@.claudinite/shared/CLAUDE.md\`,
  and the legacy self-check paragraph replaced with the current one (exact
  texts: bootstrap.md, "Import the corpus index");
- \`.gitignore\`: drop \`!/.claudinite/mount/\`, \`/.claudinite/mount/*\`,
  \`!/.claudinite/mount/sync-claudinite.sh\`, \`/.claudinite.new/\`; ensure
  \`/.claudinite/*\`, \`!/.claudinite/shared/\`, \`!/.claudinite/local_packs/\`,
  and the two hooks-log ignores;
- \`.github/workflows/claudinite-checks-ci.yml\` added from the vendor tree's
  own copy at \`.claudinite/shared/packs/basics/stubs/claudinite-checks-ci.yml\`
  (skip if the member already tracks a file at that workflow path);
- the tracked \`.claudinite/mount/sync-claudinite.sh\` deleted.

**3. After the commit**, open one member issue titled
\`Re-paste the Claudinite environment Setup script\` (idempotent — search
first, open or closed counts): the previously pasted script keeps working until
the environment is next rebuilt, at which point it fails fast; the new body to
paste is the member's own \`.claudinite/shared/mount/environment-setup.sh\`.

**Failure of any part -> write nothing.** The member keeps running the legacy
mount coherently, the failure goes to the routine's failure log, and the next
night retries. Never split the commit; never convert a member this record does
not name.
`,
  },
};

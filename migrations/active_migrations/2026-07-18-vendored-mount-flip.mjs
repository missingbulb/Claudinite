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

**Preconditions** — idempotent, three states (not two — #329):
- **Pre-flip** (tracked \`.claudinite/mount/sync-claudinite.sh\` present, no
  \`claudinite\` stamp in its \`.claudinite-checks.json\`) -> full conversion below.
- **Half-flipped** (stamp present AND the hook still present — a previous run
  died between the content commit and the hook delete; the stamp rides the
  content commit, so its presence proves the content landed) -> skip to
  step 2b, delete the hook, then step 3.
- **Flipped** (stamp present, hook gone), or not named by \`flip.repos\`
  (unless it is 'fleet') -> do nothing.

**1. Build the member's vendor tree locally** (the fleet session runs in the
canon checkout with a shell): first verify the checkout is at the canon's
**remote** default-branch head (one MCP read of the head sha vs \`git rev-parse
HEAD\`) — a lagging checkout is this unit's failure, never a tree to converge
from (#328; apply-vendor refuses a mismatched or rewinding ref on its own).
Then make a scratch dir; write the member's fetched
\`.claudinite-checks.json\` into it; replicate any member
\`.claudinite/local_packs/*/pack.mjs\` files at the same paths (their skills
lists feed the set); run
\`node mount/apply-vendor.mjs --target <scratch> --ref <verified remote head sha>\`.
The scratch now holds \`.claudinite/shared/**\` and the stamped declaration.

**2. Land ONE commit** on the member (delivery-aware — both \`auto\` and
\`review\` (and their legacy \`push\`/\`pr\` aliases) land on the
\`claudinite/maintenance\` branch and its PR: \`auto\` arms auto-merge,
\`review\` leaves it for the owner; never a direct commit to the default
branch), containing exactly:
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
- \`.gitignore\`: drop the whole legacy Claudinite block (\`/.claudinite/*\`, the
  \`mount/\` re-include dance, \`/.claudinite.new/\`); keep only the two hooks-log
  ignores (\`/.claudinite-hooks.log\`, \`/.claudinite-hooks.log.tmp\`) — the
  vendored world writes nothing untracked into \`.claudinite/\` (#385).

**2b. Delete the tracked \`.claudinite/mount/sync-claudinite.sh\`** — its own
\`delete_file\` commit, immediately after: MCP's \`push_files\` cannot combine
writes with a delete, so the "one commit" above is really content-then-delete
(#329). The stamp travels in the content commit, so a crash between the two
leaves the resumable half-flipped state the preconditions finish — never a
wedge. The stray hook is inert meanwhile (nothing references it after the
settings rewrite).

**3. After the commit**, open one member issue titled
\`Re-paste the Claudinite environment Setup script\` (idempotent — search
first, open or closed counts): the previously pasted script keeps working until
the environment is next rebuilt, at which point it fails fast; the new body to
paste is the member's own \`.claudinite/shared/mount/environment-setup.sh\`.

**Failure before the content commit -> write nothing.** The member keeps
running the legacy mount coherently, the failure goes to the routine's failure
log, and the next night retries. A failure between the content commit and 2b's
delete leaves the half-flipped state the preconditions resume — also logged.
Never put any content in 2b's delete commit or the hook delete in the content
commit; never convert a member this record does not name.
`,
  },
};

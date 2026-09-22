## 2026-09-21 · born · everything in CLAUDE.md loads every session
- **Source:** the check's own failure message, which is the only evidence of its intent that
  survives here — the earliest pack-local commit touching it is the version bump ea4b096, so this
  date is DERIVED rather than observed and the check is older than it.
- **Reason:** as the check put it, everything in CLAUDE.md loads every session, and past roughly 200
  lines it crowds out the rules that matter.
- **Mechanism:** a declared advisory capping the file at 200 lines, scoped to the root CLAUDE.md so
  a fixture or example copy that never loads is not flagged.
- **Actor:** run of the session that re-pointed it (@missingbulb, owner).
- **Model:** claude-opus-5
- **Landed:** commit ea4b096.

## 2026-09-22 · scope-changed · it measured the file, and on a Claudinite member that file is one line
- **Source:** the owner asked what a session loads beyond its RULES.md files. This repo's CLAUDE.md
  is a single `@` import; the tree behind it came to 15.8k tokens with nothing bounding it, while
  the check written to bound exactly that had never fired and structurally could not.
- **Reason:** what an instruction file costs a session is what it BRINGS. Adoption turns a member's
  CLAUDE.md into an import line, so measuring the file alone goes vacuous on precisely the repos the
  check exists for — and goes vacuous silently, reading as a budget being met.
- **Mechanism:** moved from a declared `maxLines` to a coded world rule that resolves the `@`
  imports transitively and sums tokens, because the declaration language matches lines within one
  file and this assertion is a sum over a set that only the first file names. The unit changed from
  lines to tokens, a context window being what the cost lands in. The budget is a ceiling with
  headroom over today's figure, not a demand to shrink now.
- **Rejected:** renaming the id to say `session-context-budget`. `usage.GENERATED.json` stores this
  check's finding counts keyed by the name, so a rename reads the series as ending rather than
  continuing, and the decode-side map that would prevent that costs more than the clearer name buys.
- **Retire when:** the harness stops resolving `@` imports out of CLAUDE.md, or a session's
  always-on prose stops arriving through it.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5

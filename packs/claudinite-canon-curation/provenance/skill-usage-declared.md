## 2026-09-22 · born · Usage review: skills declare their expected usage, rules read it back (#2214)
- **Source:** the usage review's own design, `docs/usage-review/DESIGN.md`.
- **Reason:** without a declared expectation, a skill that never loads and one that is never needed
  read the same zero, so the review cannot tell a broken skill from a healthy one. The declaration
  is otherwise unenforced - the harness never reads `metadata` - so a mis-declared expectation would
  stay silent until the review listed the skill as unstated a month later.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a blocking check of `writing-claudinite-skills`, catching it at authoring time
  through the same frontmatter reader the review uses, so the two can never disagree about what a
  block says. It refuses only the half a file can prove wrong by itself - `triggered` with no
  force-load declaration, and a retired key left in the block. The engine is read through a
  namespace import and a capability probe, since `usageOf` and `EXPECTS` ship on a different cadence
  from this pack and a named import of an export the member's engine lacks would fault the whole
  pack.
- **Rejected:** having a skill predict its own load rate. The first draft declared
  `loads-per-sessions`, a guess the record can never contradict, so the rule dividing by it would
  have measured its author rather than the skill; the `routine`/`rare` pair went with it, two
  spellings of one state.
- **Landed:** #2214 (Refs #2084).

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268

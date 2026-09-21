## 2026-09-21 · born · a repo adopting with a CLAUDE.md had no method for it (#2191)
- **Source:** the owner, asking whether a skill existed to take a CLAUDE.md prose file and convert
  it into a pack using the pack system's carriers; a survey of the mounted skills found none -
  `extract-packs-from-a-project` is canon-side and not seeded into a member, and the two extraction
  skills both infer rules from evidence rather than read ones already written.
- **Reason:** every rule in a CLAUDE.md loads in every session whatever the task, because that file
  has exactly one rung available to it. The conversion's value is the routing - whose pack, and
  which rung - not the copying, and the moment it is worth most is adoption, before a later run
  has copied the rules forward by hand.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5
- **Mechanism:** a workflow skill in claudinite-growth, reached by its description and named from
  `adopt-claudinite`. Growth because its corpus is the repo's own local packs, alongside the other
  extract-from-* skills, and because the pack is `seededByDefault` so every adopting member has it
  mounted; a check cannot carry it, the routing being a judgment per rule.
- **Rejected:** widening `extract-packs-from-a-project` instead - it is canon-curation's,
  `seededByDefault: false`, and a member never has it; its job is also deciding what becomes canon,
  which a member has no standing to do.
- **Retire when:** members stop arriving with instruction prose written outside the pack system, or
  the routing becomes mechanical enough for a check.
- **Landed:** #2191

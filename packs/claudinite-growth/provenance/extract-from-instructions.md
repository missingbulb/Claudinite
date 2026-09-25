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

## 2026-09-21 · reworded · #2189 landed the person's pack while this was in flight (#2191)
- **Reason:** the routing target was written against a preferences store holding prose, and it is
  now an ordinary pack. Two consequences the sort had to carry: the vocabulary is "a person's
  rules", not "a preference", and the ladder runs in that pack too, so a personal rule is no longer
  a reason to settle for prose. The pack's own person-wanting-skill states the reciprocal constraint
  - a person's pack may hold nothing a project owns - which is this skill's two-axis sort read from
  the other side, so the skill now cites it rather than asserting the boundary alone.
- **Actor:** @missingbulb (owner), asking that every assumption be re-checked after the rebase.
- **Model:** claude-opus-5
- **Landed:** #2191

## 2026-09-22 · trigger-changed · the description was carrying the body's summary, and every session paid for it
- **Reason:** past 60 words the description had stopped being what decides whether to reach for the
  skill and become a precis of the method, which the body already carries and which loads only when
  the skill does.
- **Mechanism:** the trigger half is kept whole — the moments, in the words somebody would use at
  those moments — and the summary half dropped; no force-load path changed, so what the harness
  loads deterministically is untouched and only the model's judgment call reads different text.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).

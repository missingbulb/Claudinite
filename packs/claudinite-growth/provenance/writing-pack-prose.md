## 2026-09-01 · born · writing-pack-prose: the pack-prose authoring skill and the per-pack references doc (#1561)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the writing-pack-prose skill, body guidelines, reached by its description.
- **Landed:** #1561 (Closes #1560).

## 2026-09-02 · reworded · A pack's references.md stays canon-side and never vendors (#1618)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1618 (Closes #1615).

## 2026-09-20 · reworded · Skill frontmatter: a skill declares what its body is, workflow or guidelines (#2166)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #2166 (Refs #2136).

## 2026-09-20 · reworded · Provenance: a file grows by advice, and a guidelines skill's bullets are the skill's (#2185)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #2185 (Refs #2169).

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).

## 2026-09-27 · trigger-changed · a pack's pitch is pack prose too
- **Reason:** the manifest gained a `pitch`, and the owner asked the pack-writing skill to say how
  one is written and who it is for.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a section of this skill, force-loaded on `pack.mjs` edits beside RULES.md and
  SKILL.md, since the pitch lives in the manifest.

## 2026-09-28 · trigger-changed · forced on a pack.json edit too
- **Reason:** a manifest may now be pack.json, and an edit to one is the same edit as to a pack.mjs.
- **Actor:** @missingbulb (owner), asking for pack.json manifests.
- **Mechanism:** force-load-on-file-edits-paths gains `**/packs/*/pack.json`.

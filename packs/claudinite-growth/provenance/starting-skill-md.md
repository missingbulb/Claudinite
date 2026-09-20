## 2026-09-20 · born · converted from references.md (writing-pack-prose-3)
- **Reason:** Owner decision on the provenance design (PR #2136): per-element provenance "should be
  extracted for independent elements, like rules.md or guidelines in skill.md, but not for every
  paragraph in a skill.md that is describing a workflow", and "skills should self-describe what they
  are — workplan or guidelines". Declared rather than inferred because a workflow carries
  bold-trigger bullets too and a skill that mixes steps and gotchas (thirty bullets beside ten steps
  on the shelf today) is its author's call.
- **Mechanism:** prose, a guideline of the writing-pack-prose skill
- **Retire when:** Retire if the corpus stops keeping per-element records of skill guidelines, or a
  structural read of the two shapes proves reliable over the whole shelf.

## 2026-09-20 · born · a skill declares its body (#2166)
- **Source:** the provenance design (#2136), section 1, and the owner's correction that a skill
  should say what it is, a workflow or guidelines.
- **Reason:** the two shapes look alike from outside, and a skill that mixes steps and gotchas is
  classified by its author, not by a count.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the writing-pack-prose skill, forced on every SKILL.md edit, so the
  body is declared where the skill is written; the harness ignores the key.
- **Landed:** #2166.

## 2026-09-20 · reworded · a guidelines skill's rules are kept on the skill's one file until one diverges
- **Reason:** the owner's decision of 2026-09-20, so a skill's provenance is denoted once and not
  per line.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.

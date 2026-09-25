## 2026-09-05 · born · Rules → skills: the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Source:** the owner's decision on #1662's extraction pass.
- **Reason:** forty-odd rules had moved into description-triggered skills, and a description is
  matched by the model reading the skill listing, which is not a predictable load - so a rule leaves
  RULES.md only for a skill a file-edit path forces.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a guideline of the writing-pack-prose skill.
- **Retire when:** the harness offers a deterministic skill trigger other than a file edit or a
  user's own slash invocation, and the corpus adopts it.
- **Landed:** #1667 (Refs #1662) · pack version 60904.3.

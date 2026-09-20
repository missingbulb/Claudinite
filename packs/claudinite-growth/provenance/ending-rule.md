## 2026-09-20 · born · the marker that ends a rule (#2176)
- **Source:** the provenance design (#2136), section 1: the marker is the one token the design adds
  to injected prose.
- **Reason:** a prose rule has no stable id; the marker gives it one, the reference from the prose
  to its file and the id a member's override can name across rewordings.
- **Actor:** @missingbulb (owner) approved the design; the session that wrote #2176 landed it.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the writing-pack-prose skill, forced on every RULES.md and SKILL.md
  edit, so the marker is asked for at the moment a rule is written.
- **Rejected:** a numeric marker, which no reader can follow to a file and which says nothing about
  the guideline; a link to the file, which a session would follow.
- **Landed:** #2176.

## 2026-09-20 · reworded · a shared marker, and a guidelines skill's bullets unmarked by default
- **Reason:** the owner's decisions of 2026-09-20: two rules whose history is one may share a
  marker, and a guidelines skill's bullets are the skill's file's until one diverges.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.

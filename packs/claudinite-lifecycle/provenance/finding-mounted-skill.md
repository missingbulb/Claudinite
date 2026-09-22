## 2026-08-17 · born · a mounted skill's links resolve against its real path (#949)
- **Source:** two members' local packs, promoted in a growth sweep.
- **Reason:** the `Skill` tool announces a per-session flat base directory holding only that one
  file, so a relative link the skill's own text carries dangles from it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Finding a mounted skill, or following a link from
  inside one you already loaded"; it is judgment about a tool's behaviour in flight, with no static
  signature a check could carry.
- **Landed:** #949 (Refs #99).

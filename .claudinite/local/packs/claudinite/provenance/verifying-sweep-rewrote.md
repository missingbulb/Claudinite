## 2026-09-08 · born · converted from references.md (RULES-81)
- **Reason:** #1887's citation sweep (session 1ee51249, 2026-09-07): the link's declared exit
  criterion was a grep for the retired `DESIGN §n` / `SCENARIOS.md` / `RESEARCH.md` tokens, and it
  read clean. An independent subagent review then found ~20 sites where the substitution left a
  stranded prefix word (`"tasks-dispatch PRINCIPLES.md"`) or cited the doc twice in one
  parenthetical, one citation repointed to a live document it never referenced, and one semantically
  broken substitution — none of which carry a retired token, so none could trip that grep.
- **Mechanism:** prose
- **Retire when:** Retire the rule only if a mechanism can judge a rewritten citation's replacement
  text.

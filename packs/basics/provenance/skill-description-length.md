## 2026-09-22 · born · a skill's description is always-on context and nothing bounded it
- **Source:** the owner asked what a session loads beyond its RULES.md files. The 38 skills mounted
  here carried 2.5k tokens of description — 67 per skill against 130 for the 9 skills the same
  session got from outside the corpus — with nine descriptions past 60 words and one at 199, ten
  times the median.
- **Reason:** a description is matched against a session's activity, so every session in every
  declaring repo pays for it whether or not the skill ever loads; the method it was summarising is
  in the body, which loads only when the skill does. Nothing bounded it, and the one context-budget
  check that existed measured CLAUDE.md, a one-line import here.
- **Mechanism:** a declared advisory over the description line of every tracked SKILL.md, matched as
  61 words rather than a byte length because the cost is tokens and tokens track words. Advisory
  like its two neighbours: the bar is a budget to weigh, not a wrong answer to refuse. Not coded —
  the assertion is one line of one file, which the declaration language says directly.
- **Rejected:** maxLineLength with skipLinesMatching, which reads as the same rule and is not —
  the skip only masks matchLines, so the cap would have judged every line of every skill body.
- **Retire when:** descriptions stop being matched against a session's activity from the system
  prompt, or the harness stops charging a session for the ones it never loads.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5

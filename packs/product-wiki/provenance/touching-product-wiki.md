## 2026-07-17 · born · Add product-wiki pack: the self-growing product research wiki standard (#301)
- **Source:** the standard missingbulb/GoogleCalendarEventCreator had just adopted (its #678) - the
  LLM-wiki pattern Karpathy described: compile findings once, refine in place, cite everything, keep
  a dated growth log.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "The sink is human-reviewed only.".
- **Landed:** #301 (Refs #302) · pack version 1.

## 2026-09-03 · moved · Path-scoped skills: a skill names the files the guard holds edits for until it is loaded (#1650)
- **Reason:** the sink rule's two halves part here. What a session editing the wiki must not touch
  goes into the skill; what a session that only reads the wiki may build on stays in RULES.md as a
  rule of its own.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a guideline of the writing-wiki-pages skill, triggered on "Touching
  product-wiki/product-requirements/.", in place of its RULES.md bullet.
- **Landed:** #1650 (Closes #1648) · pack version 60903.2.

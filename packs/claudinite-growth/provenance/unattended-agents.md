## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Mechanism:** the `agenticBestPractices.md` corpus doc, read by every session through the corpus
  index; it becomes a skill at #128.
- **Landed:** commit 5235b9d3.

## 2026-06-25 · moved · Restructure corpus into general/, preferences/, technologies/ with soft routing (a979d7eb)
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** the corpus doc moves to `general/agenticBestPractices.md`, reached by a plain
  relative link from the index rather than by an @-import.
- **Landed:** commit a979d7eb.

## 2026-06-26 · moved · Restructure the corpus index: always/ + tasks/ split, @-imported baseline, minimized index (ad569aaa)
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** the index splits into `always/` and `tasks/`; the doc becomes
  `tasks/agenticBestPractices.md`, read on demand rather than loaded at launch.
- **Landed:** commit ad569aaa.

## 2026-07-04 · reworded · Add tasks/agentic-documentation.md - how to write instruction docs for Claude (#113)
- **Actor:** @missingbulb (owner).
- **Landed:** #113 (Refs #111).

## 2026-07-06 · moved · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the corpus docs were loaded by every session whether or not their subject was in play;
  a skill the harness surfaces on demand is the cheapest carrier that still reaches the moment.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the `agenticBestPractices.md` and `agent-architecture.md` corpus docs become
  `skills/unattended-agents/SKILL.md`, reached by its description.
- **Landed:** #128 (Closes #127, Closes #131).

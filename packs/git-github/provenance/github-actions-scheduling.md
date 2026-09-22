## 2026-07-29 · born · Pack manifest as the single source: routing guidance, skills, scoped rules (#555)
- **Source:** GitHub's own `schedule:` behaviour and Upptime's published measurement of it.
- **Reason:** the platform truth had been written into `packs/basics/scheduled-tasks.md` because
  nothing in the corpus said where a piece of content belongs, and content that could live in more
  than one pack defaulted to the baseline pack. It is Actions platform behaviour, so it moved to the
  pack that owns that. What it states: a `schedule:` trigger is a request to queue and not a promise
  to run - fires land late, fires are dropped outright with no failure and nothing in the run
  ledger, and 60 days of repository inactivity disables the schedule altogether.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a bundled skill, then of the `github-actions` pack, reached by its description; the
  scheduling doctrine itself stayed in `basics` and only the platform truth moved.
- **Landed:** #555 (issues #556, #559) · pack version 1.

## 2026-08-20 · moved · Pack reorganization: two collapses and two renames (#1081)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the skill's directory moves into this pack with the rest of the absorbed one; the
  decision is on `_pack`.
- **Landed:** #1081 (Closes #1079) · pack version 5.

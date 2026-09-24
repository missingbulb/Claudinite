## 2026-09-24 · born · a timed phase the record's vocabulary did not name (#2275)
- **Source:** #2275, where the scheduler timed `repair` and `RUN_PHASES.scheduler` still named only
  list/ask/drain, so the live run measured three repair writes and printed none of them.
- **Reason:** the hunk adding the word was lost in a rebase and nothing noticed; the renderer drops
  an unlisted word instead of refusing it.
- **Actor:** the growth-extract run over the 2026-09-23 window.
- **Model:** claude-opus-5
- **Mechanism:** a declared check joining the words timed in `packs/claudinite-tasks/src/` to the
  words `RUN_PHASES` names; the simulator's guard watches the scheduler only, and the executor's
  own test reads the parsed record, which has already dropped the unknown word.
- **Retire when:** the timer takes its word from the vocabulary rather than a literal.

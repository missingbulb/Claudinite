# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(adopt-claudinite-1)** #1167 is where the executor-routine hand-over was settled:
  `create_trigger` and the SETUP block are the session's own work, and only the
  `CCR_ROUTINE_TOKEN` secret remains a human step.
- **(check:conformance-work-scope)** #939: canon content edited without a version move shipped
  to nobody for five days across seven repos while every whole-tree check stayed green — only a
  change-scoped sweep can see "did THIS change move it". Retire the check only if the tree
  itself can show a missing per-change move.
- **(check:rules-index-current)** #807: the rules index is the only channel a pack's prose
  reaches a session on, and the loss of it is invisible from inside the session — going red is
  the only available signal. Retire the check only if a second delivery channel exists.
- **(check:skill-loaded-before-editing)** #1648: a post-hoc finding alone sends the agent back over
  work the skill would have prevented, so the guard stops the first file-tool edit; the guard sees
  no Bash-made edit, so the rule exists to close that gap. Retire it when file edits can no longer
  bypass the guard.
- **(check:skills-index-current)** #1648: the owner asked for one readable list of every mounted
  skill and what loads it, generated beside the rules index; a converge that stops leaves it
  naming skills that are gone or missing ones that arrived, which nothing else reports.

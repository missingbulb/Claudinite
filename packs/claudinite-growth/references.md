# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(unattended-agents-1)** Worked example: the origin project's daily lessons pass,
  `docs/claude/auto-lessons.md`.
- **(unattended-agents-2)** Downgrading the origin project's auto-extractor agent to Haiku led
  it to ship a bare-title case off a listing page instead of stopping; Sonnet bailed correctly
  (`docs/claude/auto-extractor.md`).
- **(unattended-agents-3)** Worked examples: the origin project's routines
  `docs/claude/auto-lessons.md` (its issue #365), `docs/claude/auto-fallback-coverage.md`
  (#366), `docs/claude/auto-branch-report.md` (#399).
- **(writing-tasks-1)** The bound and its best-effort enforcement are the task-code-work
  design's §2 and §6 — see issue #394.
- **(writing-pack-prose-1)** Measured on two adjacent instructions in one spec: the one naming a
  file was got right first try 0 runs in 5, the one shipping a fenced command 5 in 5.
- **(check:task-md-only-when-agentic)** `task.md` is defined as the spec an agentic session
  follows, and `README.md` is what an agentless worker's human-facing record is called — the
  naming decision recorded in #1055. Retire the check only if that vocabulary changes.
- **(writing-pack-prose-5)** Owner decision on #1662's extraction pass (PR #1667): forty-odd
  rules had moved into description-triggered skills, and the owner's call was "unless we have a
  force-load-on-file-edits-paths that covers all the relevant times those instructions are needed,
  let's move them back to RULES.md" — a description is matched by the model reading the skill
  listing, which is not a predictable load. Reaffirm while the harness offers no deterministic
  trigger for a skill other than a file edit (or a user's own slash invocation); retire if one
  arrives and the corpus adopts it.

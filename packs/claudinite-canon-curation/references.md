# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(writing-claudinite-skills-1)** #385 settled that there is no skill catalog and no
  agent-facing corpus index: placement in the owning pack's `skills/` is the registration, and
  the pack README names what it bundles.
- **(generate-project-instructions-1)** #385 settled that there is no agent-facing corpus index —
  the corpus map row in the repo README is the only place a new pack kind is announced.
- **(check:pack-version-claimed-once)** #1482 is what a shared version number cost: two branches
  each bumped to the same next version, both went green, `pack.mjs` auto-merged on identical
  bytes, and #1466's janitor-rule widening reached no member — the fleet swept with the old code
  while every stamp read current. Retire the check only if members stop keying re-fetch on
  `installed < canon`.
- **(RULES-1)** Owner decision, 2026-08-18: a pack whose subject is a Claudinite feature
  rather than a technology or a way of working carries the prefix. `claudinite-growth` predates
  the decision.
- **(RULES-2)** Mounting filters on the literal declaration and the home does not declare
  `git-github`, so that pack's skills are absent from this repo's `.claude/skills/` while their
  procedure still applies here.
- **(RULES-3)** `packs/README.md` was rewritten to state how to count instead of quoting a
  total, so that every pack change stopped having to edit it; a transcribed total is stale at
  the next pack change.
- **(RULES-4)** #919 deleted the `configSchema` manifest seam and both coded per-pack
  validators whole, on the owner's call that a bespoke validation vocabulary is the wrong shape
  for config whichever end it is authored at; the PR states the accepted cost, that a malformed
  entry now goes silent. Retire the rule only if the owner reverses that call.
- **(RULES-5)** #959's captured session: the owner rejected an `engine/` module shared by two
  packs' tasks ("We can't ever have code that needs to be shared by two packs saved in
  'engine'. That breaks the model."), and then rejected even a shared file with a drift guard
  for the one piece that was genuinely identical logic ("why do you even need a drift guard?
  Just write the json. Don't overkill"). Retire the rule only if the owner reverses that call.
- **(RULES-6)** `comment-classification` blocked a session on `[Request interrupted by user
  for tool use]`, read as the owner's latest comment, because `humanText` drops an entry
  starting with `<` and lets a bracketed marker straight through. Retire the rule only if the
  helper stops screening by that first character.
- **(RULES-7)** Same incident as the transcript rule above: at the Stop hook a false positive
  blocks the turn and spends a whole cycle on something no edit can clear, so the fixture
  carries an interruption marker beside a real owner turn.
- **(RULES-8)** #1060: gating release checks on the orchestrator workflow's name alone means a
  repo that renamed it loses every release check including the one that tells it to rename it
  back — and gating on the config alone leaves `cer/release-config`, whose whole job is a
  missing config, unreachable. Two signals, either sufficient, is what survives.
- **(RULES-9)** #1138: a check exercising the scheduler's own vendored stub had never been
  extended to the executor's, which is just as fleet-wide and just as capable of drifting
  unnoticed.
- **(RULES-10)** #1118: `comment-classification` fired 204 blocking times in 31 days — 21% of
  all blocking findings, the second-most-fired check — each one a blocked Stop-hook turn spent
  re-emitting a line the session had already been told to emit. The owner's call was to keep
  the rule and drop the check.
- **(RULES-11)** #1119: the false green survives only until the lower PR merges and this one
  rebases onto its real base, so the check's own result against a pre-merge base proves
  nothing.

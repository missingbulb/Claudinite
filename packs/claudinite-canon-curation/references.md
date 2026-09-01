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

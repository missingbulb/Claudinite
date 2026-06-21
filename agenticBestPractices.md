# Agentic best practices

Durable, project-agnostic practices for running AI agents — distilled from what
worked here. Each is one tight rule; the worked example lives in its own doc.

- **A daily "lessons learned" pass keeps hard-won insights from evaporating.**
  Run it over recent activity to fold durable, reusable lessons into shared docs
  before they're forgotten. Key discipline: dedupe ruthlessly against the
  existing docs, route each lesson to the doc that owns it, keep additions terse
  — and most days add nothing. (Worked example: `docs/claude/auto-lessons.md`.)
- **Match the agent model to the judgment it must make.** A weaker/cheaper model is adequate for mechanical extraction but fails silently on judgment calls — it ships a plausible-but-wrong output where a capable model would correctly bail. Downgrade only for tasks the weaker model reliably handles. (Downgrading the auto-extractor agent to Haiku led it to ship a bare-title case off a listing page instead of stopping; Sonnet bailed correctly — `docs/claude/auto-extractor.md`.)
- **Give each unattended recurring routine its own standing tracking issue as a
  self-improvement log.** Log every run that produces a change there — as a
  **dated comment**, not a sub-issue — so the routine's output accumulates in one
  reviewable feed, making it easy to audit what it did over time and to tell when
  the routine itself needs tuning. One issue per routine, not a shared parent;
  have the routine find its issue by a stable attribute (title/label) rather than
  a bare number that can dangle, and **reopen it if it was closed** while runs
  still need logging. (Worked examples: `docs/claude/auto-lessons.md` #365,
  `docs/claude/auto-fallback-coverage.md` #366,
  `docs/claude/auto-branch-report.md` #399.)
- **Keep an unattended routine's instructions in a repo doc, not inlined in the
  launcher's config.** The launcher prompt (a CC web routine, a cron job's
  embedded text) should be a thin pointer to a versioned in-repo doc; the doc
  carries the real spec. Inlined instructions drift silently — they can't be
  reviewed in a PR, go stale against renamed paths the repo's own tests would
  have caught, and miss conventions the repo later adds — whereas a doc the
  repo's checks and lessons pass touches stays current for free.
- **A SessionStart hook gates work through the session context it injects, not
  by blocking.** The hook's stdout becomes context the agent reads — the runtime
  never intercepts it — so enforcement is the agent's instruction-following, not
  the hook itself. Use it for setup/environment validation: output a STOP
  directive on failure (the agent asks the user before proceeding); emit nothing
  on success.

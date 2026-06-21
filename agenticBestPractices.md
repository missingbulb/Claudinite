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
- **After each task, run a brief efficiency analysis of its tool and process usage — separate from lesson capture.** Ask whether it could have used fewer operations (redundant calls, work that could be batched, polling that could have been a single wait) and less wall time without harming quality (independent serial calls that could have run in parallel, unnecessary sleeps). Flag any process that has already returned its result but is being waited out on shutdown — it can be killed once its output is in hand. Close with one concrete speed-up recommendation, or an explicit "no changes recommended." The bar is high — most runs won't yield one.
- **When driving a CI-gated merge via API/MCP poll rather than the shell, merge on an already-green required check — don't trigger or wait for a duplicate run.** A push already ran CI on the head commit; opening a PR on the same commit fires an identical second run that adds no signal. If the check isn't yet green, poll on a rolling backoff (e.g. 5 s → 10 s → 15 s → 30 s) until it settles; never tight-poll; and don't subscribe for green — CI success transitions are frequently not delivered as webhook events, so the green signal never arrives.

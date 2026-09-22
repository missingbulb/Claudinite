## 2026-09-15 · born · Measure the machinery: run-cost records and the tasks-usage fold (#2046)
- **Source:** link M1 of #1869, against the ask in #1872.
- **Reason:** the queue had never known what it costs to run - how often the scheduler and the
  executor ran, what those runs were billed, what they spent in API calls and wall time, and how
  long an occurrence took to travel from a tick to a converged item. It is the machinery's own
  past-data plane, kept beside the session fold's rather than inside it. Every tier is appended
  once, because every source is a watermarked REST listing rather than a file re-read for free, so a
  counting fix applies forward only; the week tier drops the per-run map, whose keys would grow the
  file a row a week with nothing pruning it. Where the pack config carries no Actions minute rate
  there is no spend key anywhere, never a zero, and the rate a file was priced at is written beside
  the numbers so a later rate cannot silently re-price frozen rows.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a task with no agent and a code-work worker delivered through the generated-file
  lane, gated on a precondition reading the fold's own watermark against the scheduler's most recent
  anchor - the mark's own movement, and no API call, which matters on a term asked at every tick. No
  built-in movement term can see the machinery: they all read the project's commits, issues, pull
  requests and captures, and a repo whose only activity is its own queue is silent by all four.
- **Landed:** #2046 (Refs #1869, #1872; it closes nothing by design, since #1872's own converge owns
  its state and #1869 is a tracking issue) · pack version 60915.4.

## 2026-09-21 · policy-changed · entry points set exitCode instead of exiting hard
- **Reason:** `process.exit(1)` in an entry point's catch discards whatever stdout has not drained;
  measured here, a run piped to a slow reader delivered 309 of 200,000 lines, while
  `process.exitCode = 1` delivered all of them. The exit status is unchanged; only the output
  survives.
- **Mechanism:** the guard already runs as the module's entry point, so letting the process end
  naturally is enough; nothing waits on the event loop after the catch.
- **Actor:** @missingbulb (owner), replacing #2082 whose diff predated the src/ layout move.
- **Model:** Opus 5

## 2026-09-22 · converted · The work step is declared as `code_worker_mjs` and the runner wraps it
- **Reason:** every worker re-implemented the same wrapping - the environment parsed by hand, the
  exit code, the failure line, the elapsed time, the agent-request file - and each copy was free to
  get it slightly differently wrong. The runner already owns the subprocess, so it owns the entry
  point: the module exports `worker(params)` and holds the work and nothing else.
- **Mechanism:** `code_worker_mjs` names the module beside the declaration; the executor spawns
  `claudinite-tasks`' own `worker-entry.mjs` around it, hands the module the parsed `CLAUDINITE_*`
  bag (the task's declared secrets and the Action token among it) and renders the verdict it returns
  into the queue's triage, requeue and agent-request protocol. No behaviour of the task changes: the
  same work runs, exits the same way and prints the same markers.
- **Actor:** @missingbulb (owner), who asked why every task re-implements one runner's job.
- **Model:** Opus 5

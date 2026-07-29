# Usage fold — count skill loads and their denominators from the captured logs

**This task runs no agent.** It is `agent_model: none` with `agent_preprocessing: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, which calls its sibling in this folder, the counting and folding core ([`fold-usage.mjs`](fold-usage.mjs)). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## What it does

Daily: fetch this repo's orphan `conversation-logs` branch, count each capture file still inside the retention window, and regenerate `.claudinite/local/usage.GENERATED.json` on an auto-merging PR. A byte-identical recompute opens nothing.

What it counts, per bucket:

- **`skillLoads`**, per skill name — `Skill` tool-use entries, plus user-typed `/command`s naming a skill this repo mounts (built-in CLI commands never match). Subagent streams included: a subagent loading a skill is a load.
- **`captures`** — capture events folded. **`merges`** — the subset with an issue behind them (issue `0` means none).
- **`sessions`** — distinct session ids; one session can capture more than once.
- **`userMessages`** — genuine human turns. **`userCommands`** — every typed `/command`.
- **`checks`**, per scope (`work` / `world`) — `runs` (observed activations), `failures` (runs that reported a blocking finding), `errors` (the runner could not launch), the `blocking`/`advisory` finding volume, and `ciRuns`/`ciFailures` (the CI subset of the first two). **`checkFindings`**, per rule id — which rule caught what.

The denominators are the point. A raw load count cannot tell healthy-rare from broken — a version-bump skill loading rarely is fine — so the question is loads *against the sessions where that skill's own declared trigger plausibly applied.*

## The check failures are the win

A skill load is evidence that guidance was *reached for*. A **check failure is evidence that it worked**: the finding goes back into the session through the Stop hook and the agent corrects before the work leaves the branch. So the failure counts are not a defect metric to drive down — they are the closest thing this pipeline has to a measure of what the corpus is worth, and `checkFindings` says which rule earned it.

Neither runner writes a metrics file, so both are counted off the marks they already leave in the transcript, each read by one tested function against a fixture copied from a real capture:

- **the Stop hook's `hooklog` line** (`… Stop: done exit=<n> <reason>`), which reaches the transcript via hook stderr — the only mark a *passing* run leaves, and therefore the only reason work-scope **runs** are countable and not just failures. Its reason also carries the two outcomes nothing else reveals: a `loop-guard-relent` (blocking findings that survived two fix attempts, printed as a message rather than a findings block) and a `runner-error` (the checks did not run at all — enforcement silently off, which is why it gets its own counter instead of hiding inside a clean day);
- **`report-findings`' summary line** (`N blocking, M advisory (<scope> scope: …)`), which names its own scope and survives the `| tail` an agent usually pipes a run through — printed only when there *were* findings, so it counts failures, never runs;
- **the runner's invocation in a Bash command** (`node …/check_the_world.mjs`), which is how the world scope runs at all — it is wired into the test/CI flow, not the Stop hook.

Runs come only from the marks a passing run also leaves; where a runner ran without its command naming it (a `make test` wrapping it), the summary lines are the floor, so the count is the **max** of the two signals rather than their sum. Only Bash and CI-log tool results are read, paired back to the tool that produced them — in the corpus that owns the runners, reading a file that merely *mentions* this vocabulary is the ordinary case.

### CI counts when the agent was in the loop on it

Write, commit, let CI run, fix what it caught is the same correction loop as the Stop hook's, one turn wider — so a CI check failure the session acted on is the same kind of win. It counts exactly when the session **pulled the job log in**, which is what "the agent was in the loop" means operationally. A nightly or post-merge run nobody looked at stays uncounted, correctly: nothing was corrected.

Two consequences, both mechanism rather than policy. Actions stamps every log line with its own timestamp before the command's output, so each mark tolerates that prefix — without it a fetched CI log reads as having printed nothing at all. And a job log gets fetched repeatedly while iterating on the failure, with nothing in a fetch saying *which run* it was, so CI texts dedupe on the check output itself: two fetches of one job collapse, two real runs differ by their timestamps.

**Every check number is a floor.** A run whose CI log nobody fetched left no mark in any session transcript; neither did a hook killed before it logged; and a green CI sweep prints nothing to be seen by, which is why the CI share is carried separately as `ciRuns`/`ciFailures` instead of quietly skewing a rate. The under-count is one-directional by construction, which is what keeps "the checks caught N things this week" a claim worth making.

## Two tiers, two different mechanisms

- **Days** are recomputed **from scratch, every run**, from the live capture files. No ingest ledger, no double-count risk, and a counting-bug fix self-heals the whole visible window on its next run. A day row drops out when its raw files age past retention — its content lives on in its week row.
- **Weeks** are appended **once**, past a single `foldedThrough` watermark: every day that has closed since the mark is added to its ISO week and the mark advances. Days close strictly in order, so a monotone mark is the entire exactly-once mechanism.

Week rows are frozen by that trade: a counting bug found later heals the day window automatically, but weeks folded under the old counting keep it — re-freezing would need raw data the retention TTL deliberately destroyed. Git history records which commit folded what. A *new* counter meets the same trade from the other end: weeks folded before the check counts existed carry no `checks` key, and the fold grows them from the day they close forward rather than refusing to advance the watermark past them — a partial series beats a wedged one.

## The file is GENERATED

`.claudinite/local/usage.GENERATED.json` is machine-written and never hand-edited — it lives under `.claudinite/local/` because that is the repo-owned area the vendoring refresh never touches. The worker also declares its `merge=ours` `.gitattributes` entry, so a conflicting merge resolves by re-running the fold rather than by hand.

## Failure is visible, never silent

A fold outage longer than about `retention_days - 1` days loses the raw backing for the unfolded days. That loss is **declared**: each week row records how many days it absorbed, so a week reading `days: 5` states its own hole rather than quietly reporting a smaller number as if it were complete.

# Conversation extract — the per-repo nightly routine

The growth pack's conversation-side nightly: mine this repo's captured conversation logs for
durable lessons, post the dialogue behind each extracted rule on the issue it was worked under,
and delete logs that have aged past retention. **Per-repo and fleet-free**: unlike this pack's
`run_daily` tasks, it runs in this repo's own checkout (local git, the session's GitHub MCP
tools for issue comments) — it is not a planner unit, the fleet orchestrator must never
dispatch it, and each repo schedules it itself ([README.md](README.md#adopting-the-conversation-lifecycle)).

This routine is the conversation-side sibling of [extract.md](extract.md) (which mines issues,
PRs, and commits and never sees a conversation). The **method** — the friction signals, the
measured efficiency analysis, the lesson bar — stays canonical in
[extracting-lessons.md](extracting-lessons.md) and is not restated here. The captured log
carries what that method needs: per-entry timestamps, per-message token usage, and the
tool_use/tool_result pairs behind wall-time numbers.

## Conventions

- **Default branch** — `main` stands for this repo's default branch; substitute your own.
- **Paths** — script/doc paths are canon-relative; in a consumer they live under
  `.claudinite/shared/` (in the canon repo, at the repo root).
- **GitHub writes are MCP-native** — issue comments go through the session's `mcp__github__*`
  tools. Everything else is local git against this one repo.

## The run

1. **Fetch the queue.** `git fetch origin conversation-logs`; list its files
   (`git ls-tree --name-only origin/conversation-logs`). No branch, or no `*.jsonl` → stop;
   a quiet night is the common, valid outcome.
2. **Fresh pass** — every log whose filename stamp is within the **last 48 hours** (the overlap
   with the previous night is deliberate: corpus dedup absorbs a re-read, and the window
   self-heals a missed night). For each: read it (`git show origin/conversation-logs:<file>`)
   and run the extracting-lessons method over it — including the wall-time/efficiency analysis,
   measured from the log's own timestamps, never hand-waved.
3. **Route and commit.** Fold each keeper into the repo's **own local packs**
   (`.claudinite/local_packs/`) at the local promotion ladder's strongest mechanism, exactly as
   extracting-lessons.md prescribes. One commit to `main` for the whole run, direct (no per-run
   PR — same rationale as [extract.md](extract.md): a nightly that only writes the project's
   own packs must not pile up review requests). Finding nothing is fine and common.
4. **Post the conversation behind each landed rule.** Only when a rule actually landed in the
   corpus this run: render its source log's dialogue —
   `node packs/grow_with_claudinite/render-dialogue.mjs <tmp-copy> --max-chars 60000` — and post
   it on the issue named in the log's filename (`--issue-<n>--`), one comment per chunk, opening
   with one provenance line: the rule added, the capture date, the session id. The issue being
   closed is expected (the merge closed it). A log that yielded nothing gets **no** comment —
   extraction is the only path to permanence.
5. **Retention sweep.** Read `retention_days` from this repo's `.claudinite-checks.json`
   grow_with_claudinite entry (`config.retention_days`). **Unset → skip deletion entirely**
   (capture-only adoption). Otherwise, for each log whose filename stamp is older than
   `retention_days` days: give it a **final hindsight pass** — one last read against the
   now-current corpus and the week's activity, steps 3–4 applying to anything it still yields —
   then delete. All deletions land as **one commit** on the branch (`git rm` each file, message
   ending `[skip ci]`), pushed plain — never a history rewrite, never a force-push.

## Tracking: log each run under the routine's own issue

The standing log is the issue titled exactly **`Claudinite tracker: Conversation Extract`** in
this repo — found by that exact title, never a number; created **closed** if missing; its state
never changed afterward. When a run lands a lesson, posts dialogue, or deletes logs, log it as
one dated comment naming what changed; a run that changed nothing logs nothing.

## Run on a capable model

Whether a lesson clears the bar — and whether the hindsight pass should overturn a fresh-pass
call — is the judgment this routine exists for, and its commits land without a review gate.
Run it (and schedule it) on a capable model.

## What this routine must never do

- **Never merge `conversation-logs`** anywhere, and never rewrite its history — plain add and
  remove commits only.
- **Never post raw JSONL to an issue** — only the rendered dialogue, chunked under the comment
  size cap.
- **Never delete a log younger than retention, and never delete anything while
  `retention_days` is unset** — deletion is the ack that both passes happened.
- **Never touch the shared canon** — writes go to this repo's `.claudinite/local_packs/`,
  `main`, its issues, and the logs branch; lifting portable lessons is promote's job.
- **Never run as a fleet unit** — this spec assumes the repo's own checkout and local git.

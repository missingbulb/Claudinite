# Conversation extract — the growth pack's conversation-side daily task

The conversation-side sibling of [extract.md](extract.md): mine a repo's captured conversation
logs for durable lessons, post the dialogue behind each extracted rule on the issue it was worked
under, and prune logs past retention. Like every fleet worker it runs **centrally** (home session,
fleet token) and **MCP-native** — extraction only reads the already-pushed logs, so it needs no
local checkout of the member. (Only the *capture* step needs the live session transcript, so
capture stays in-session at merge; extraction does not.)

The **method** — the friction signals, the measured efficiency analysis, the lesson bar — stays
canonical in [extracting-lessons.md](extracting-lessons.md) and is not restated here. The captured
log carries what that method needs: per-entry timestamps, per-message token usage, and the
tool_use/tool_result pairs behind wall-time numbers.

## Conventions used in this doc

- **Default branch.** `main` stands for the member repo's default branch — substitute whatever it
  uses.
- **GitHub access is MCP-native.** Everything goes through the session's GitHub MCP tools
  (`mcp__github__*`): read via `get_file_contents` (with `ref: conversation-logs` for the logs
  branch), write lessons via `push_files`, comment via `add_issue_comment`, prune via
  `delete_file`. The fleet run has no shell GitHub access and no cross-repo checkout — never reach
  for `gh`/`curl` or a member clone. (Rendering the dialogue is a local `node` helper on the home
  checkout — see step 4 — not a GitHub call.)
- **The project's local packs.** Everything under `.claudinite/local_packs/` on the member's
  `main` — the project's own capture surface (the canon home repo's own is
  `.claudinite/local_packs/claudinite/`); never the read-only mounted canon elsewhere under
  `.claudinite/`.

## The run

1. **List the queue.** `get_file_contents` on the `conversation-logs` branch root
   (`ref: conversation-logs`). No branch, or no `*.jsonl` → stop; a quiet repo is the common,
   valid outcome.
2. **Read retention.** From the member's `.claudinite-checks.json` (`get_file_contents`, default
   branch), the grow_with_claudinite entry's `config.retention_days`. Unset → the prune in step 5
   is skipped entirely (capture-only adoption).
3. **Fresh pass.** For each log captured in the recent window (its filename carries the capture
   stamp; corpus dedup makes an overlapping re-read harmless, so err toward re-reading the last
   several days): read it (`get_file_contents`, `ref: conversation-logs`) and run the
   extracting-lessons method over it — including the wall-time/efficiency analysis, measured from
   the log's own timestamps, never hand-waved.
4. **Route, write, and post.** Fold each keeper into the member's **own local packs**
   (`.claudinite/local_packs/`) at the local promotion ladder's strongest mechanism, exactly as
   extracting-lessons.md prescribes — one `push_files` commit to `main` for the whole run, direct
   (no per-run PR, same rationale as [extract.md](extract.md)). For each rule that actually
   landed, render its source log's dialogue — write the log's JSONL to a temp file on the home
   checkout and run `node packs/grow_with_claudinite/render-dialogue.mjs <tmp> --max-chars 60000` —
   and `add_issue_comment` on the issue named in the log's filename (`--issue-<n>--`), one comment
   per chunk, opening with one provenance line (the rule added, the capture date, the session id).
   A log that yields nothing gets **no** comment — extraction is the only path to permanence.
   Finding nothing at all is fine and common.
5. **Retention prune.** When `retention_days` is set: for each log whose filename stamp is older
   than `retention_days` days, give it a **final hindsight pass** — one last read against the
   now-current corpus (steps 3–4 apply to anything it still yields) — then `delete_file` it from
   the `conversation-logs` branch (message ending `[skip ci]`). The branch is never merged and its
   history is never rewritten — plain deletes only.

## Tracking: log each run under the routine's own issue

The standing log is the issue titled exactly **`Claudinite tracker: Conversation Extract`** in
this member repo — found by that exact title, never a number; created **closed** if missing; its
state never changed afterward. When a run lands a lesson, posts dialogue, or prunes logs, log it
as one dated comment naming what changed; a run that changed nothing logs nothing.

## Run on a capable model

Whether a lesson clears the bar — and whether the hindsight pass should overturn a fresh-pass
call — is the judgment this task exists for, and its commits land without a review gate. Its
`smarts: high` names the tier; run it there.

## What this task must never do

- **Never merge `conversation-logs`** anywhere, and never rewrite its history — plain add and
  remove commits only.
- **Never post raw JSONL to an issue** — only the rendered dialogue, chunked under the comment
  size cap.
- **Never delete a log younger than retention, and never delete anything while
  `retention_days` is unset** — deletion is the ack that both passes happened.
- **Never touch the shared canon** — writes go to the member's `.claudinite/local_packs/`, its
  `main`, its issues, and its logs branch; lifting portable lessons is [promote](../canon-curation/promote.md)'s job.

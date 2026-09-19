# logs-prune

## Why the declaration reads as it does

Carried over from the declaration's comments when it became `task.json`.

claudinite-growth task: logs-prune — retention on the `conversation-logs`
branch. `agent_model: 'none'` with `code_work: 'node worker.mjs'`: the whole pass
is deterministic code the scheduler runs as a subprocess — no agent, no dispatch
issue, seconds of runtime. The same shape usage-fold already has over the same
branch.

WHY IT IS NOT PART OF growth-extract. Deleting a capture past retention is
arithmetic on dates over an orphan branch — which is why the extract worker had
to spend prose forbidding an agent to merge that branch or rewrite its history.
Coupled to the opus run it also kept that run's precondition carrying a second
arm whose only job was to fire the prune on a quiet repo, so a repo with nothing
to extract still paid an opus dispatch on the nights one log aged out.

WHAT MAKES AGE ENOUGH. Deletion is decided on the stamp in a filename, with no
judgment step over the capture itself — an aged log gets no final pass. What
makes that safe is the extract run's READING
WINDOW, not a per-file handshake between the two tasks: growth-extract reads from
the oldest end of the branch on every run, against a retention measured in days,
so a capture reaches retention having been read. The extract-from-conversations
skill owns that window; this task owns the arithmetic.

The whole contract is this default export; the retention arithmetic it names is
in preconditions.mjs beside it.
NOTHING ASKS IT. `trigger: 'request'` (owner, 2026-09-19): a capture the calendar
decided to delete is data loss nobody asked for, so no tick mints an occurrence
and the branch is pruned only when somebody wakes the task. `log-past-retention`
stays beside it — the term in preconditions.mjs, the arithmetic this task owns —
so a wake with nothing aged out declines instead of running an empty pass; a bare
item with no reading behind it runs, because the item's only other exit is closed
unrun and that would leave the task with no lever at all. No cadence term can sit
here: one is inert on a request task, and rejected.
It opens no PR: its whole write is remove commits on the non-default logs
branch, which is outside the outcome taxonomy.
One ls-remote, one fetch, one tree read, at most one push — against a branch
whose size retention itself bounds. Seconds. The bound is protection against a
hung network call, not headroom for work, so it sits just past the slowest
plausible fetch rather than at the leash.

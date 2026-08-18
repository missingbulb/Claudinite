# Logs prune — retention on the conversation-logs branch

**This task runs no agent.** It is `agent_model: none` with `prework: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, deciding what to delete with its sibling [`prune-logs.mjs`](prune-logs.mjs). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## What it does

Daily, where this repo declares `config.retention_days`: fetch the orphan `conversation-logs` branch, and remove every capture that is **both** past retention **and** marked processed by a [growth-extract](../growth-extract/task.md) run. Unset retention means the prune deletes nothing at all — capture-only adoption, and the fail-safe default. The removals ride one commit on the branch's own tip, marked `[skip ci]`; the branch is never merged and its history is never rewritten.

## Two conditions, because deletion is irreversible

A log's conversation is gone once this task deletes it — extraction is the only path to permanence — so age alone is not licence. Age is arithmetic this task owns. Whether anything ever *read* the log is a fact only the extract run knows, and it says so by writing a **`<log>.processed` marker beside it**. This task deletes a capture only when it carries one.

The marker is a sidecar file rather than a `processed/` prefix or a manifest: the prefix moves captures into a subdirectory where this branch's two existing readers (the scheduler's `conversationLogs` signal and the [usage fold](../usage-fold/task.md), both listing the tree flat and matching the capture filename) stop seeing them, and a manifest is one file every run rewrites. A sidecar is additive, one write per log, and invisible to both readers — their patterns anchor on `.jsonl`.

The consequence is deliberate: **a capture no extract run ever consumed is never pruned.** The worker reports how many it is holding on each run, so a repo whose extract stopped running does not look like a quiet one.

## Racing with capture is benign

The capture step pushes to this same branch from live sessions. The prune's commit is a plain fast-forward on the tip it just read, so a capture landing mid-run has its push win and this one rejected — and the worker re-plans against the new tip rather than forcing anything.

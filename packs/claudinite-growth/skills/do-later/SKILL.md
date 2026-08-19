---
name: do-later
description: File a change to be made AFTER the work in flight — a well-defined issue, marked for the queue and blocked behind the current PR/issue and behind the previous deferral, so repeated asks chain. Use when the owner says "/do-later …", "do this after this lands", or otherwise defers a change instead of derailing the session.
---

# /do-later — defer a change into a chained request run

The owner has spotted a change that should happen **after** the work in front of
them. Doing it now derails the session; an ordinary issue waits for somebody to
remember it. This files it as an **ad-hoc request** (tasks-dispatch DESIGN §16):
an issue the queue picks up on its own, held behind what is still in flight.

You are filing work, not doing it. Touch no source file, open no branch.

## What you write

**One issue, well defined.** The run that implements it will never see this
conversation — the issue body is the whole brief. State the change, the files or
surfaces it touches if you know them, what "done" looks like, and anything the
owner ruled out. Size it to its idea; a rename is a sentence.

Give the body these two lines, verbatim in this spelling — the tick reads the
first one:

```
Blocked-by: #<what this waits on>

<!-- filed by /do-later -->
```

**What it waits on**, first match wins:

1. the issue of the **previous `/do-later` you filed in this session** — that is
   the chain the owner asked for, each deferral behind the last;
2. otherwise the **pull request** the session's work is on, if one is open;
3. otherwise the **issue** the session is working on;
4. otherwise nothing — omit the field, and say in your reply that it queues
   immediately.

Only ever name blockers that will actually *close* — a merged PR does, a branch
does not. If you filed an earlier `/do-later` this session but no longer have its
number, find it by its marker line among the repo's open issues rather than
falling back to (2).

## The labels — the mark, the model, the merge

Apply all three (`mcp__github__issue_write`, `labels`):

- **`claude-task`** — the mark. The next tick adopts the issue into a work item,
  blocked on what you named, and releases it once those close.
- **`claude-model:<family>`** — the family **this** session is running, so the
  deferred work is done by what the owner is working with now. Read it with
  `get_session` (claude-code-remote, `session_id` omitted) and map
  `session_context.model` to `opus`, `sonnet` or `haiku`. A model outside those
  three has no label — omit it and the run takes the default.
- **`claude-automerge`** — the standing authorization to land the change without
  the owner's approval **when the run's diff turns out to be narrow** (docs,
  tests, comment-only edits, and code within a single directory; the run measures
  this, not you). **Withhold it whenever the owner said they want to see this
  one** — "let me review it", "show me before merging", or any such wording
  outranks how small the change looks.

If a label does not exist in the repository yet, the mark cannot be applied (the
API refuses an unknown label, and only the tick creates them). Say so in your
reply and leave the issue filed — the labels appear on the next tick, and the
owner can mark it from the issue page.

## Then say what you filed

One line back to the owner: the issue link, what it waits on, the model family,
and whether it will merge itself or come back for approval.

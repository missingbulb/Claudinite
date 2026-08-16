# Claudinite tasks dashboard

A read-only view of what a repo's Claudinite scheduler is doing — the declared task
roster, the live work-item queue, the outcome history, and the Actions runs behind
them — on one page.

```sh
node dev/tools/tasks-dashboard/serve.mjs missingbulb/Claudinite
# → http://127.0.0.1:8099/dev/tools/tasks-dashboard/?repo=missingbulb/Claudinite
```

Paste a GitHub token in the header (or leave it blank for a public repo, on the
anonymous rate limit) and it loads. The repo argument is optional; the box and the
`?repo=` parameter do the same thing, and any repo you can read works — this is a
canon-home tool that points at a member, not something a member hosts.

## What it shows

| Panel | Answers |
|---|---|
| **Stat tiles** | How many tasks exist, what is open, what is parked or past a leash, what is running, when the next anchor falls |
| **Task roster** | Every *declared* task — cadence, model, outcome ceiling, precondition signals, its current work item, its next anchor, and its outcome history |
| **Queue** | Open `[claudinite-work]` items by state, what each is waiting on, how long it has sat, and which recovery rule is about to claim it |
| **Scheduler runs** | Recent and in-flight Actions runs |

A task with no work item still gets a row: "never ran" is usually the thing you
opened this for, and an issue-derived list would omit it silently.

## Access control

There is no server component and no shared credential. The page calls
`api.github.com` from the browser with the token the viewer pastes, so **the
viewer's own GitHub permissions are the entire access-control story** — a repo they
cannot read stays unreadable. The token lives in that browser's `localStorage` and
is sent to GitHub and nowhere else. A fine-grained token needs read-only
**Contents**, **Issues** and **Actions**.

`serve.mjs` binds loopback, serves the checkout read-only, and never talks to
GitHub.

## Why it needs a server for a page with no backend

The dashboard does not restate the queue's vocabulary — it **imports** it. The
label set, the title grammar, the leash constants and the anchor arithmetic all
come from the engine modules that define them:

- [`engine/scheduler/queue/work-item.mjs`](../../../engine/scheduler/queue/work-item.mjs) — labels, title grammar, body fields, comment markers
- [`engine/scheduler/queue/leases.mjs`](../../../engine/scheduler/queue/leases.mjs) — the leash and staleness thresholds
- [`engine/scheduler/queue/anchors.mjs`](../../../engine/scheduler/queue/anchors.mjs) — when a task next wakes

So the page cannot drift from the mechanism it renders: there is no second copy to
drift. ES module imports are CORS-checked, which is the one consequence — from a
`file://` origin every one of those imports is blocked, so the page needs an
`http://` origin. Any static server over the checkout root satisfies it; `serve.mjs`
is just the one-command version. Nothing is deployed and nothing is hosted.

`tasks-dashboard.test.mjs` pins both halves of that arrangement: that those engine
modules stay free of `node:` imports (a browser-only breakage the Node tests would
otherwise never catch), and that this tool states no queue label of its own.

## Reading limits it will tell you about

Two things are windows rather than totals, and the page says so in its footer
rather than implying completeness:

- **Issue history** is the most recent few hundred issues, not all of them. On a
  busy repo an old task's history is outside the window, which reads as "none in
  window" rather than "never run".
- **The declaration parse** lifts scalar fields out of `task.mjs` as text, because
  there is nothing to `import` when reading another repo over the API. A field it
  cannot read renders as *unknown* and is never defaulted — a confident wrong
  cadence would move a next-anchor the roster is read for.

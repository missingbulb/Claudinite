# The task dashboard

A read-only view of what a repo's Claudinite scheduler is doing — the declared task
roster, the live work-item queue, the outcome history, and the Actions runs behind
them — on one page. It is part of the engine, so every member gets it in its mount
at `.claudinite/shared/engine/scheduler/dashboard/` and any of them can serve it.

It renders **any** repo the viewer can read, chosen by `?repo=owner/name` or by the
repo picker, so one deployment covers a whole fleet.

## Running it

Locally, against a checkout:

```sh
node engine/scheduler/dashboard/serve.mjs missingbulb/Claudinite
```

Deployed, it is static files behind any web server — including GitHub Pages. See
**Deploying** below for the one file a deployment adds.

## What it shows

| Panel | Answers |
|---|---|
| **Stat tiles** | How many tasks exist, what is open, what is parked or past a leash, what is running, when the next anchor falls |
| **Task roster** | Every *declared* task — cadence, model, outcome ceiling, precondition signals, its current work item, its next anchor, its outcome history |
| **Queue** | Open `[claudinite-work]` items by state, what each waits on, how long it has sat, and which recovery rule is about to claim it |
| **Scheduler runs** | Recent and in-flight Actions runs |

A task with no work item still gets a row: "never ran" is usually the thing you
opened this for, and an issue-derived list would omit it silently.

## Who it runs as

**The viewer, and only the viewer.** There is no backend, no shared credential and
no service account: the page calls `api.github.com` from the browser as whoever is
using it, so it can show nobody anything their own GitHub account cannot already
read. The credential lives in `sessionStorage` and dies with the tab.

Two ways to get one:

- **Sign in with GitHub** — a button, no typing. Available when the deployment
  configures `clientId` and `exchangeUrl`.
- **A pasted token** — the fallback, and the local-development path. Needs
  read-only **Contents**, **Issues** and **Actions**.

### Why "just use my existing GitHub login" is not on that list

It cannot be. A browser will not send github.com's session cookies to
`api.github.com`, and the API does not accept cookie auth cross-origin at all —
"already logged in to GitHub" is not a credential a web page can spend. Every
GitHub-backed dashboard you have used either asked for a token or ran an OAuth
sign-in; there is no third option.

Sign-in is the closest thing, and it is genuinely *your* permissions: after one
authorization, every call runs as you. The only piece that cannot live in the page
is the `code` → token exchange, which needs the app's client secret **and** hits an
endpoint that sends no CORS headers. That is what `exchangeUrl` points at —
[`oauth-exchange.example.mjs`](oauth-exchange.example.mjs) is a deployable
implementation. It sees one code, returns one token, and never touches repo data.

## Caching

A fleet view is only affordable because most of what it reads does not change.
Three strategies, because the data has three shapes — see
[`cache.mjs`](cache.mjs):

| Data | Strategy | Why |
|---|---|---|
| Repo content (task declarations, the tree) | keyed by **commit SHA**, never expires | a path at a sha cannot change, so an unmoved `main` costs zero calls |
| Open items, runs, repo metadata | **ETag** revalidation | a `304` is free — it does not count against the rate limit, so this is fresh data at no cost |
| Closed-issue history pages | **24h TTL** | settled, but not addressable by a sha |

Measured on this repo, cold versus warm: **21 requests → 4**, and the warm load
spends **zero** rate limit (its four requests are all 304s). The open queue is still
never stale — only settled history ages.

Stored payloads are compact projections, not API responses: a closed item's body is
dropped and an open one's truncated past its scheduling fields, because
`localStorage` gives about 5MB and a fleet's raw issue JSON is far more. A full
quota degrades to "uncached", never to an error. **Clear cache** forces a cold read.

## Deploying

The dashboard is static files. A deployment adds exactly one:
`dashboard.config.json`, beside the page — see
[`dashboard.config.example.json`](dashboard.config.example.json) for every key.

It is **not** committed here, and that is deliberate: this directory is vendored
into every member under `.claudinite/shared/`, where nothing may be hand-edited
because the converge replaces the tree. A deploying site copies the dashboard and
writes its own config next to the copy. Absent config is valid — it means the
token fallback and whatever repo the URL names.

`serve.mjs` is for local use only: it binds loopback, serves the checkout read-only,
and never talks to GitHub.

## Why it imports the engine instead of restating it

The page states none of the queue's vocabulary. Labels, the title grammar, the leash
constants and the anchor arithmetic all come from the modules that define them —
[`../queue/work-item.mjs`](../queue/work-item.mjs),
[`../queue/leases.mjs`](../queue/leases.mjs),
[`../queue/anchors.mjs`](../queue/anchors.mjs) — so there is no second copy to drift
from the mechanism being rendered.

ES module imports are CORS-checked, which is the one consequence: the page needs an
`http(s)://` origin and will not run from `file://`. Any static server satisfies it.

The tests pin both halves: that those engine modules stay free of `node:` imports (a
**browser-only** breakage the Node suite would otherwise never catch), and that this
tool hardcodes no queue label of its own.

## Limits it reports rather than hides

- **Issue history is a window** — the most recent few hundred issues, not all of
  them. Outside it, a task's history reads as "none in window", never "never run".
  The footer states which.
- **Declaration fields are lifted as text**, because there is nothing to `import`
  when reading another repo over the API. A field it cannot read renders *unknown*
  and is never defaulted — a confident wrong cadence would move a next-anchor the
  roster is read for.

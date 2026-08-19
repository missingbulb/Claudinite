<img src="badge.svg" width="24" height="24" alt=""> claudinite-dashboard

A read-only view of what a repo's — or a fleet's — Claudinite scheduler is doing: the
declared task roster, the live work-item queue, the outcome history, and the Actions
runs behind them.

**Opt-in.** Nothing fingerprints it and `--init` never seeds it: a repo carries this
because someone declared it. Adopting it wires the GitHub Pages deploy.

**It also carries the task that writes the briefs the page reads** —
[`fleet-digest`](tasks/fleet-digest/task.md), daily. That is not gated on anything: a
repo that declares this pack for the page alone gets the task too, and the task needs
`FLEET_GITHUB_TOKEN` (an account-spanning PAT: Metadata, Contents, Issues and Pull
requests, read, across all repositories). Without that secret its work item parks
asking for one, and nothing else about the pack is affected. Declare this pack on the
repo that *is* your fleet's enforcer, and you get both halves; declare it somewhere
else and either configure the secret or expect the parked item.

## Adopting it

```jsonc
// .claudinite-checks.json
{ "packs": ["claudinite-dashboard"] }
```

That is the whole of it for a member: the dashboard covers this repo, signs in with a
pasted token, and publishes to Pages. Adoption seeds
[the deploy workflow](stubs/workflows/claudinite-dashboard-pages.yml) into
`.github/workflows/`, and **you must enable Pages with source *GitHub Actions*** — a
repository setting no Action can flip; until then the deploy job is the only thing
that fails.

Everything else is optional `config` on the declaration:

| Key | Default | What it buys |
|---|---|---|
| `rosterFile` | — | A file in the repo listing members; more than one makes the **fleet overview** the landing view |
| `repos` | — | An inline roster instead of a file |
| `canonRepo` | — | The reference member mounts are compared against; unset means freshness reads *unknown* rather than being guessed |
| `digestsRepo` | — | The repo the fleet's morning briefs are read from; unset turns the digests panel off |
| `digestsPath` | `digests` | The directory inside it |
| `owner`, `exclude`, `digest` | this repo's owner; none; `pick` 4, `nudge` on | The [fleet-digest task's](#the-morning-briefs) knobs — whose repos a brief covers and what it names |
| `clientId`, `exchangeUrl` | — | Both together turn on **Sign in with GitHub**; either alone does nothing |
| `redirectUri` | the page's URL | Override when the callback differs |
| `defaultRepo` | this repo | Which repo a single-repo deployment shows |

## Why a pack and not engine code

Nothing converges, ticks or executes because the dashboard exists, and a member that
never looks at it should not carry it. Engine code is what every member *runs*; this
is content a member opts into. Being a pack also buys it a version and migration
lane, a declaration that gates it, and an adoption moment at which the deploy can be
wired — none of which engine code has.

It has **two views**, and which one you land on is the URL:

- **Fleet** — every member at once, worst first. What a deployment with a roster
  opens on.
- **Repo** — one member's scheduler in full. Reached by clicking a member, or
  `?repo=owner/name` directly.

A deployment with one member (or none) goes straight to the repo view: a one-row
fleet overview would be nothing but a click in the way.

## Running it locally

```sh
node packs/claudinite-dashboard/serve.mjs missingbulb/Claudinite
```

## What it shows

| Panel | Answers |
|---|---|
| **Stat tiles** | How many tasks exist, what is open, what is parked or past a leash, what is running, when the next anchor falls |
| **Task roster** | Every *declared* task — cadence, model, outcome ceiling, precondition signals, its current work item, its next anchor, its outcome history |
| **Queue** | Open `[claudinite-work]` items by state, what each waits on, how long it has sat, and which recovery rule is about to claim it |
| **Scheduler runs** | Recent and in-flight Actions runs |

A task with no work item still gets a row: "never ran" is usually the thing you
opened this for, and an issue-derived list would omit it silently.

## The fleet view

A fleet page answers a different question from the per-repo one. Per repo it is
"what is this scheduler doing"; across a fleet it is **"where do I need to look"** —
and a page that answers the first question twelve times over does not answer the
second. So nothing on it is a total for its own sake.

| Panel | Answers |
|---|---|
| **What Claudinite did this week** | The work the machinery did that nobody had to do — this week against last |
| **The last two mornings** | Yesterday's and the day before's fleet digest, when the deployment names a `digestsRepo` |
| **Fleet activity** | What the fleet *did* per day — work closed by outcome, runs and their pass rate, which members moved at all |
| **Rollup tiles** | How many *members* need a human — not how many items exist |
| **Members** | Every member ranked worst-first, in three column groups: **Status** (its own CI, stars, when it last moved), **Claudinite** (packs, tasks, queue, outcomes, mount, scheduler) and **Work** (issues and pull requests waiting on a person) |
| **Tasks across the fleet** | One task, everywhere it runs — a shared pack's task parked in four members at once is a canon problem no single repo's page reveals |
| **Pack adoption** | Which packs are in use and how widely — who a change to a pack would reach |

Three rules shape it, and they are in [`fleet.mjs`](fleet.mjs):

**Attention is earned, not counted.** A member surfaces because something is *true*
of it — an item parked, a leash blown, a scheduler failing, a mount that stopped
converging — and each arrives as a reason with a severity, never as a number to be
summed. One parked item outranks forty healthy work items.

**Absence is a state.** A member that does not run Claudinite, one you cannot read,
and one that is running fine are three different answers and never collapse into
"0". Not being able to see a repo is a permissions fact reported quietly, not an
alarm competing with a genuinely broken member.

**One member's failure is one row's problem.** Every member is summarised
independently, so a private repo or a rate-limit stumble becomes a row that says so
rather than a blank page.

**A healthy fleet and a dead one look identical to a fault-finder.** Every panel that
answers "where do I need to look" reads zero after a good week — and after a month of
nobody touching anything. So two panels answer the other question instead. **Fleet
activity** plots what happened per day: work closed by outcome, scheduler runs and
their pass rate, and which members moved at all. Above them, **what Claudinite did
this week** counts the work nobody had to do — completed items, how many of those
closed with nobody in the loop, how many did need a person — this week against last.

Two rules keep that block honest, and they are why some obvious figures are missing
from it. **No vanity total**: every figure is bounded by a window, because a number
that only grows says nothing about today. **Nothing invented**: no estimated hours
saved, no score. Checks enforced and rule tokens are not there because no read this
page makes can count them, and a plausible guess in a tile is worse than a gap.

Every figure in both panels comes from reads the page already makes — the issue page,
the runs list, and the head commit whose date arrives with the sha the cache is keyed
by. What that costs is depth rather than requests: one issue page and thirty runs do
not reach back a fortnight on a busy member, so each series states the day before
which it is a floor rather than a count.

Two signals are visible *only* here, because no single repo's page has the
comparison:

- **Mount drift** — each member's `ref` and `engineVersion` against the canon's.
  Judged on those and never on `updated` alone, since a held stamp pins `updated`
  behind a pending note while the mount converges normally. Needs `canonRepo` in the
  config; without it freshness reads *unknown* rather than being guessed.
- **A scheduler that never ran** — a member that declares tasks and has never
  produced a work item is not idle, it is unwired. Every per-repo number for it is a
  perfectly healthy zero.

## The morning briefs

### Writing them

[`tasks/fleet-digest/`](tasks/fleet-digest/task.md) writes one file a morning at
`digests/<date>.md`: the few things the fleet actually accomplished the day before,
plus one project worth returning to. It was the `sheepdog` pack's sixth sweep until it
moved here — that pack enumerates the fleet, but this is the pack whose page reads the
result, and the producer and its only reader are now one adoption.

Two stages, conditionally. The agentless `code_work` stage
([`worker.mjs`](tasks/fleet-digest/worker.mjs)) enumerates the fleet, ranks the day's
merged PRs and closed issues **by size**, filters Claudinite's own maintenance PRs and
work items out of every stream (the machine is the fleet's busiest actor and would
otherwise win its own rankings), and pushes a shortlist half again longer than the
brief needs. The agent then reads only that shortlist and picks the accomplishments —
size is arithmetic and belongs in code, "the biggest thing I did yesterday" is a
reading of the text. On a day the fleet merged nothing, the code-work stage writes the brief itself
and requests no agent: a missing file in a dated series has to stay legible as a
*fault* rather than as a slow Tuesday.

Everything it needs is optional, on this pack's own declaration `config`:

| key | default | what it does |
|---|---|---|
| `owner` | this repo's owner | whose repositories the brief covers |
| `exclude` | none | repos deliberately kept out, a full `owner/name` each |
| `digest.pick` | `4` | how many accomplishments the brief names (the shortlist is `ceil(pick × 1.5)`, so the agent has a real choice rather than a ranking to transcribe) |
| `digest.nudge` | on, 7 days | the "worth returning to" prod. `false` switches it off; `{ "quietDays": 21 }` widens the window |

An enforcer that declared `owner`, `exclude` or `digest` on its **`sheepdog`** entry
before the move needs to change nothing: [`digest-config.mjs`](tasks/fleet-digest/digest-config.mjs)
reads this pack's entry first and falls back to that one, and every run logs which it
used — a dropped `exclude` list would otherwise widen the brief silently.

**Quiet is measured on meaningful merges, never on pushes.** Every member's mount is
converged nightly, so `pushed_at` is fresh on every repo in the fleet every day and
would report the whole fleet as permanently active.

To catch the series up after an outage, create the item by hand with a day count:

```
node .claudinite/shared/engine/scheduler/queue/create-work-item.mjs claudinite-dashboard/fleet-digest \
  --context "DIGEST_BACKFILL_DAYS=7"
```

It covers the N most recent complete UTC days, oldest first, skips any day that already
has a brief, and is bounded at 30 days a run — so it is safe to re-run and safe to
overlap with the daily task.

### Showing them

The page shows **yesterday's and the day before's**, from the two dated files, when the
deployment names `digestsRepo` — the repo is named rather than assumed, because the
repo publishing this page is not necessarily the one the briefs are written in.

A day with no file is a **normal state** — the task had nothing to report, or has not
run — and reads as that, never as an error. A repo the viewer cannot read is a third
state again, and says so.

The brief is **plain text despite its `.md` name**: its writer's contract forbids
markdown, because the file is read out verbatim through a renderer that parses none.
So the page's reader is a few rules over lines — a title, sections, `• ` items, bare
URLs — in [`digest.mjs`](digest.mjs), and not a Markdown library, which would be the
wrong reader for the file as well as a dependency for a page that has none.

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

### What each credential is worth

The reason sign-in is not a nicety. GitHub's limits, per hour:

| Credential | Limit |
|---|---|
| unauthenticated | **60**, per IP address |
| a user token — PAT, OAuth, or a GitHub App user token | **5,000**, shared across every app acting for that user |
| a GitHub App *installation* token | 5,000 minimum, up to 12,500 by size |
| an Actions `GITHUB_TOKEN` | 1,000, per repository |

A twelve-member sweep costs around 75 requests cold. So an unconfigured deployment —
no `clientId`, nobody pasting a token — exceeds the whole anonymous hour on its
**first load**, and 5,000/hour is not an optimisation over that, it is 83×. There is
no higher tier available to a page that runs as its viewer: an installation token
would raise the ceiling, but only by putting a shared credential behind a backend,
which would show every viewer everything that app can see. That is a different
product, not a bigger limit.

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

A fourth thing decides how hard those three are leaned on: **the budget policy**
([`budget.mjs`](budget.mjs)), planned before a load starts and re-planned on every
one. It exists because caching alone still *asks* — an ETag revalidation costs no
primary budget but is still a request, and a cold entry has nothing to revalidate.

| Budget, measured in whole page loads | Mode | What changes |
|---|---|---|
| 20 loads or more | `live` | everything revalidated — today's behaviour |
| 6–20 | `tight` | anything read in the last 5m is served with no request |
| 1–6 | `low` | …in the last 30m |
| under 1 | `scarce` | …until the rate limit resets, and the spend stops short of the viewer's last requests |
| spent | `frozen` | no requests at all; the page serves what it has and says so |

The rung that matters is `scarce`: the staleness floor reaches the **reset**, so a
full page refresh costs nothing until the window rolls. Three supporting pieces make
that hold up — the free `GET /rate_limit` preflight and a budget carried across page
loads (so a fresh tab plans before it spends rather than learning the limit by hitting
it), and a latch on a `403`/`429` with nothing left (so eleven more members do not each
spend a request discovering the same thing; requests *made* are what the secondary
limit counts). A withheld read is its own state everywhere it surfaces — a row that
says the page declined to spend, never one that says the repo is broken.

Measured on this repo, cold versus warm: **21 requests → 4**, and the warm load
spends **zero** rate limit (its four requests are all 304s). The open queue is still
never stale — only settled history ages.

Stored payloads are compact projections, not API responses: a closed item's body is
dropped and an open one's truncated past its scheduling fields, because
`localStorage` gives about 5MB and a fleet's raw issue JSON is far more. A full
quota degrades to "uncached", never to an error. **Clear cache** forces a cold read.

## How publishing works

[`build-site.mjs`](build-site.mjs) stages the page and the engine modules it imports
into `_site/`, then writes the roster and the `dashboard.config.json` the page reads —
derived from the declaration's `config`, so there is no second place to configure the
same thing.

Two things about that split are deliberate:

- **The workflow is seeded; the build script is not.** `.github/workflows/` is the one
  directory the nightly update cannot push to, so a deploy workflow can only arrive by
  being written at adoption — and it never converges after. It is therefore a thin
  shim that calls `build-site.mjs` out of the mount, exactly as the scheduler stub
  calls the engine's tick. Only the file that must be frozen is frozen.
- **The staged tree mirrors the mount's layout**, publishing at
  `/packs/claudinite-dashboard/` with the root as a redirect. That is load-bearing, not
  tidiness: the page imports the queue's modules by relative path so it cannot drift
  from them, and flattening it to the site root sends those imports above the root —
  the page would not boot.

The build is inert until the mount carries the pack (adopted, not yet converged): it
exits clean with no `_site`, and the workflow skips the deploy rather than replacing a
working site with an empty artifact.

`serve.mjs` is for local use only: it binds loopback, serves the checkout read-only,
and never talks to GitHub.

## Why it imports the engine instead of restating it

The page states none of the queue's vocabulary. Labels, the title grammar, the leash
constants and the anchor arithmetic all come from the modules that define them —
[`work-item.mjs`](../../engine/scheduler/queue/work-item.mjs),
[`leases.mjs`](../../engine/scheduler/queue/leases.mjs),
[`anchors.mjs`](../../engine/scheduler/queue/anchors.mjs) — so there is no second copy to drift
from the mechanism being rendered.

Those paths — `../../engine/scheduler/queue/…` — resolve identically in the canon
(`packs/<id>/` beside `engine/`) and in a member's mount
(`.claudinite/shared/packs/<id>/` beside `.claudinite/shared/engine/`), which is why
the pack is readable straight out of the mount with nothing rewritten.

ES module imports are CORS-checked, which is the one consequence: the page needs an
`http(s)://` origin and will not run from `file://`. Any static server satisfies it.

The tests pin both halves: that those engine modules stay free of `node:` imports (a
**browser-only** breakage the Node suite would otherwise never catch), and that this
tool hardcodes no queue label of its own.

The digest task is the one part of this pack that does **not** run in a browser, and it
keeps its own trimmed copies of the two cross-repo helpers it needs
([`fleet-reads.mjs`](tasks/fleet-digest/fleet-reads.mjs),
[`param-bag.mjs`](tasks/fleet-digest/param-bag.mjs)) rather than importing the `sheepdog`
pack's. Two packs adopted independently must not depend on each other, and what is
duplicated is a token-authenticated fetch, a pagination loop and a file read — the REST
API's shape, not a decision either pack can drift on.

## Limits it reports rather than hides

- **Issue history is a window** — the most recent few hundred issues, not all of
  them. Outside it, a task's history reads as "none in window", never "never run".
  The footer states which.
- **Declaration fields are lifted as text**, because there is nothing to `import`
  when reading another repo over the API. A field it cannot read renders *unknown*
  and is never defaulted — a confident wrong cadence would move a next-anchor the
  roster is read for.

## Checks

Both are the digest's — nothing here polices the page, which is a page and not a
practice.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `digest-plain-text` | medium | correctness | check: blocking |
| `dated-fixture-collision` | medium | correctness | check: blocking |

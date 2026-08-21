<img src="badge.svg" width="24" height="24" alt=""> claudinite-dashboard

A read-only view of what a repo's — or a fleet's — Claudinite is doing: what is stuck,
what is queued, what has run, and what the corpus has been costing and catching.

**Two modes, decided by shape rather than by a switch.** A declaration that says where
more than one member comes from builds the **fleet dashboard**; anything else builds
that repo's own **repo dashboard**. Nothing to ask at adoption and nothing to hold in
step — the roster source *is* the mode.

**Opt-in.** Nothing fingerprints it and `--init` never seeds it: a repo carries this
because someone declared it. Adopting it wires the GitHub Pages deploy.

**It also carries the task that writes the briefs the page reads** —
[`fleet-digest`](tasks/fleet-digest/task.md), daily. That is not gated on anything: a
repo that declares this pack for the page alone gets the task too, and the task needs
`FLEET_GITHUB_TOKEN`, an account-spanning PAT granted exactly what
[`fleet-token.mjs`](tasks/fleet-digest/fleet-token.mjs)'s table names — the one place
those permissions are written, and what the adoption handover step hands a human.
Without that secret its work item parks
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
| `owner` | — | Whose repos this deployment covers. The page **enumerates them in the browser, as the viewer** — so this is a fleet deployment, and the fleet a person sees is exactly the fleet they can read. The way to build a fleet dashboard |
| `exclude` | none | Repos under that owner that are not members (either `owner/name` or the bare name). Archived and forked repos leave by their own state |
| `repos` | — | An explicit member list instead, for a deployment that wants a fixed set |
| `rosterFile` | — | A generated artifact in the repo listing members — the legacy shape, still read |
| `canonRepo` | — | The repo whose live engine and pack versions member stamps are compared against; unset means freshness reads *unknown* rather than being guessed |
| `digestsRepo` | — | The repo the fleet's morning briefs are read from; unset turns the digests panel off |
| `digestsPath` | `digests` | The directory inside it |
| `digest` | `pick` 4, `nudge` on | The [fleet-digest task's](#the-morning-briefs) knobs — how many items a brief names and whether it prods a quiet project. It reads `owner` and `exclude` too, so a fleet deployment states them once |
| `clientId`, `exchangeUrl` | — | Both together turn on **Sign in with GitHub**; either alone does nothing |
| `redirectUri` | the page's URL | Override when the callback differs |
| `defaultRepo` | this repo | Which repo a single-repo deployment shows |

## Why a pack and not engine code

Nothing converges, scheduler runs or executes because the dashboard exists, and a member that
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

## Two kinds of data, read two different ways

Everything on both pages is one of two things, and the difference is the whole reason
the page can afford what it shows.

**What is true right now** is a live read, and there are few of them: the repo, its
head commit, one page of issues, one page of Actions runs. All are ETag-revalidated,
and a `304` costs no rate-limit budget at all.

**What happened before** is one file: the repo's own
`.claudinite/local/usage.GENERATED.json`, folded hourly by the
[usage-fold task](../claudinite-growth/tasks/usage-fold/README.md) in the
claudinite-growth pack. It is content at a sha, so it is read once when the default
branch moves and **not at all** while it has not. Reaching a month back over the API
instead would be a paginated crawl per repo per load, which is exactly the shape this
client is built to avoid.

Measured against a stubbed API, one repo with five declared tasks:

| | Requests | Of those, free |
|---|---|---|
| Cold (empty cache) | 14 | 0 |
| Warm (same head sha) | 5 | **5** — every one a `304`, nothing spent |

So a warm reload of a repo page costs **nothing** against the viewer's budget.

The two freshnesses are reported separately in the footer, because they are not the
same: the live half is as fresh as this load, the past half as fresh as the repo's last
fold. A page that showed one timestamp for both would be claiming the older half is as
current as the newer.

A repo that does not fold the file is a normal state, not a fault: the panels that
wanted it say so, and nothing else on the page is affected.

## What the repo page shows

| Panel | Answers |
|---|---|
| **At a glance** | Minutes waiting on a person and what they are made of, items parked, open pull requests and issues, CI on the default branch, runs in flight, stars, and drift against the canon |
| **Work** | One row per piece of work, in three views — **stuck** (what has stopped, and for how long), **pending** (what is moving, and what happens next), **all** (what each task is and what it has done). The page opens on the worst view that has anything in it |
| **What the queue closed** | Per-day outcomes over a fortnight — today from the live issue page, the days before it from the fold |
| **What ran** | 48 hours of scheduler runs, executor runs and agent sessions per hour; hovering an hour names the tasks that executed in it |
| **What Claudinite is doing here** | 30 days of rule tokens against checks executed, on two stated scales — plus tokens spent, lines committed and releases where the fold carries them |

### One table, not two

The roster and the queue used to be separate tables, and they were the same rows
twice: a task's row could not say what its item was doing without repeating the item
table, and an item's row could not say what it was *for* without repeating the roster.
Worse, the reader had to join them by eye to answer the question they opened the page
with — is anything stuck.

So there is one row per piece of work and the **view decides which rows and which
columns**. The three views are three genuinely different questions, which is why they
do not share a column set. Switching between them moves the rows rather than redrawing
them, so the row you were reading stays findable; a reader who has asked their platform
for less motion gets the repaint and none of the movement.

Two rows exist that neither old table could show. A **declared task that has never
run** — usually the thing you opened the page for, and invisible in any list built from
work items. And an **open item whose task this repo no longer declares**: nothing will
ever pick it up, and no recovery rule will say so.

Everything flagged mirrors a rule the engine will actually act on — a blown leash the
next run reclaims, a dependency past the janitor's threshold, a park holding its task's
lane — never a display heuristic.

### Not read is not zero

The rule that runs through every panel here. A day the fold has not reached is drawn
**blank**, not at the floor; a line breaks over a day nothing answered for rather than
dipping through it; a series the file does not carry is **named as absent** instead of
rendering as an empty chart; and a total sums only the days that had an opinion, or
reports nothing at all.

This matters most where a number is a report card. "No session recorded its token
spend" and "the sessions were free" are different facts, and a page that draws them
identically is worse than one that omits the panel.

## The fleet view

A fleet page answers a different question from the per-repo one. Per repo it is
"what is this scheduler doing"; across a fleet it is **"where do I need to look"** —
and a page that answers the first question twelve times over does not answer the
second. So nothing on it is a total for its own sake.

| Panel | Answers |
|---|---|
| **What Claudinite did this week** | The work the machinery did that nobody had to do — this week against last, including the check findings caught inside sessions and what the corpus costs each of them |
| **The last two mornings** | Yesterday's and the day before's fleet digest, when the deployment names a `digestsRepo` |
| **Fleet activity** | What the fleet *did* per day — work closed by outcome, runs and their pass rate, **how often the checks ran and caught something**, and which members moved at all |
| **Rollup tiles** | How many *members* need a human — not how many items exist |
| **Members** | Every member ranked worst-first, in three column groups asked in the order a reader asks them: **Activity** (90 days of commits, as a weekly curve), **Waiting on a person** (an estimate in minutes, what it is made of, then issues and pull requests) and **Claudinite** (packs wearing the mount's verdict, queue, outcomes, scheduler). Stars and CI ride in the member cell — they are how you recognise a row, not findings about it |
| **Tasks across the fleet** | One task, everywhere it runs — a shared pack's task parked in four members at once is a canon problem no single repo's page reveals |
| **Pack adoption** | Which packs are in use and how widely — who a change to a pack would reach |

### The roster is enumerated, not stored

A fleet deployment names an `owner`, and the page lists that owner's repos **as the
viewer**. So membership is decided at read time by what this person can actually see: a
repo outside their access is not in their fleet, rather than being in it as a row they
cannot open. No repo list is baked into any file, which is also why a fleet's numbers
cannot leak from a shared artifact to someone without access to the repos behind them.

Archived and forked repos leave the fleet by their own state; `exclude` covers the rest.
An enumeration that could not be read is said out loud, never rendered as a fleet that
happens to be empty.

### What only the members' own files can say

Two figures used to be named as *absent* here, because nothing the page read could count
them: how often each member's checks actually ran, and how much corpus each session is
paying for. Both are in each member's usage file, which the sweep now reads at the head
sha it already has — so both are panels rather than apologies.

A member with **no** usage file is named, never averaged in as a repo where nothing
happens. That census is the same fact a fleet-wide aggregate would carry as
`coverage.absent`, derived live from the members instead of stored in one file that
shows everyone the whole fleet.

Three rules shape it, and they are in [`fleet.mjs`](fleet.mjs):

**An estimate is published as an assumption, or not at all.** The Waiting group puts
a number of minutes on each member, at a flat rate per parked item, and the rate is a
single exported constant that the page states in its own note. Nothing here measures
how long a park actually takes; a per-kind estimate would be the same guess wearing
more decimal places, and the honest form of a number nothing measures is one you can
argue with. A broken scheduler is deliberately outside it — that is not a queue of
work to get through — though it is still reported beside it.

**A count of members is not a description of the morning.** Every attention figure
counts *members*, because "47 open items" is not a list anyone works through. But a
member surfaces for one of several different reasons, and the rollup itemises which:
three pull requests to approve and three broken task lanes are the same number and
not the same day's work. The split comes from `summariseMember`, which already
separates a failure park from an inbox park from an approval park; the tile reads it
rather than re-merging it into one word.

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

- **Mount drift** — each member's stamped `engineVersion` and `packVersions` against
  the canon's live ones (`engine/version.mjs`, each declared pack's `pack.mjs`).
  Never judged on the stamp's `ref` or `updated`: the versioned flows stamp versions
  and nothing else, so those two hold the provenance of the last *full* re-vendor and
  read months stale on every healthy member. Needs `canonRepo` in the config; without
  it freshness reads *unknown* rather than being guessed, and a pack the canon side
  cannot price is counted unpriced, never judged current.
- **A scheduler that never ran** — a member that declares tasks and has never
  produced a work item is not idle, it is unwired. Every per-repo number for it is a
  perfectly healthy zero.

## The morning briefs

### Writing them

[`tasks/fleet-digest/`](tasks/fleet-digest/task.md) writes one file a morning at
`digests/<date>.md`: the few things the fleet actually accomplished the day before,
plus one project worth returning to. It was the `claudinite-fleet-sheepdog` pack's sixth sweep until it
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

An enforcer that declared `owner`, `exclude` or `digest` on its **`claudinite-fleet-sheepdog`** entry
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

A twelve-member sweep costs around 85 requests cold. So an unconfigured deployment —
no `clientId`, nobody pasting a token — exceeds the whole anonymous hour on its
**first load**, and 5,000/hour is not an optimisation over that, it is 83×. There is
no higher tier available to a page that runs as its viewer: an installation token
would raise the ceiling, but only by putting a shared credential behind a backend,
which would show every viewer everything that app can see. That is a different
product, not a bigger limit.

### Who has to register the app — one owner, not one fleet

Sign-in belongs to **whoever owns the deployment**, and it is not inheritable. A
fleet's second, fifth and tenth dashboard reuse one registration: a GitHub App holds
up to ten callback URLs, and with wildcard matching a single `https://<user>.github.io/`
covers every project Pages site on that host, so a new deployment only copies the two
config keys.

A **different** owner cannot reuse it, and the reason is not policy but mechanism:

- a private App "can only be installed on the account that owns the app. Only members
  of the organization that owns it can authorize it" — a stranger cannot even sign in;
- making it public lets anyone authorize it, but a user access token "can only access
  resources that both the user and app can access", so until they install that App on
  their own account every member row still reads *not visible to you*;
- and if they did install it, their callback URL would have to live in someone else's
  App and their tokens would be minted by someone else's endpoint. That is a trust
  relationship, not a configuration.

So the ladder for an adopter with no app of their own is the token box, which needs no
registration and is the same 5,000/hour. Sign-in is the button they add later, for
their own fleet, with their own app.

#### Turning sign-in on

The four steps, in the order they unblock each other. Adoption files them as a tracking
issue rather than leaving them here to be met after the first anonymous viewer gives up.

1. **Register a GitHub App** with read-only **Contents**, **Issues** and **Actions**, and
   *Request user authorization (OAuth) during installation* enabled. The callback URL is
   the deployed page — or the `https://<user>.github.io/` root with **wildcard matching**,
   which covers every project Pages site on that host. Note the client id, generate a
   client secret.
2. **Install it** on the account holding the repos the dashboard reads. Per *account*, not
   per repo: a user token reaches only what the app is installed on, so an uninstalled
   account renders every member row as *not visible to you*.
3. **Deploy [`oauth-exchange.example.mjs`](oauth-exchange.example.mjs)** with that id and
   secret in its environment. One deployment serves every dashboard the same owner runs.
4. **Set `clientId` and `exchangeUrl`** in the declaration's `config`. Either alone does
   nothing — the pair is what makes the button appear.

Done when a signed-in viewer's rate pill reads `…/5000 · user`.

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
| A member's year of commit activity | **6h TTL**, and skipped entirely below `tight` | the only read here that is decoration; a few hours old is the same answer, and a tight budget goes without it before it goes without a queue |

The **commit curve** is drawn by week, not by day. Ninety daily points across a table
column is a sawtooth of weekends and Tuesdays, and a sawtooth has no shape to read —
which is the whole reason the column exists rather than the single date it replaced.
The daily counts are kept: they are the total, the peak and the hover.

A fourth thing decides how hard those three are leaned on: **the budget policy**
([`budget.mjs`](budget.mjs)), planned before a load starts and re-planned on every
one. It exists because caching alone still *asks* — an ETag revalidation costs no
primary budget but is still a request, and a cold entry has nothing to revalidate.

| Budget, measured in whole page loads | Mode | What changes |
|---|---|---|
| 20 loads or more | `live` | everything revalidated — today's behaviour |
| 6–20 | `tight` | anything read in the last 5m is served with no request |
| 1–6 | `low` | …in the last 30m, and the commit graphs are not read at all |
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
  calls the engine's scheduler run. Only the file that must be frozen is frozen.

- **It follows the scheduler rather than only a push.** The mount is the page's
  source, and the push that moves it is a Claudinite update PR auto-merged by the
  Actions token — which fires no workflow, by GitHub's design. A deployment triggered
  on `push` alone therefore keeps serving whatever the last *human* merge built, for
  as long as nobody merges by hand: Shepherd's sat two pack versions behind for days,
  still rendering a mount verdict the pack had already deleted. So the stub also
  triggers on the vendored scheduler completing — the member's one permitted
  schedule, followed rather than competed with — and asks an Actions cache entry,
  keyed on the page's sources, whether this exact tree is already live before it
  builds anything.

  **An already-adopted deployment does not get this.** Nothing converges
  `.github/workflows/`, so an existing member's copy has to be brought in line by
  hand, once.
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
[`param-bag.mjs`](tasks/fleet-digest/param-bag.mjs)) rather than importing the `claudinite-fleet-sheepdog`
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
- **The past-data half is only as fresh as the repo's last fold**, which the footer
  states separately from this load's own time. A repo that folds nothing has no past
  half at all, and the panels that wanted it say which task writes the file.
- **Which tasks a given hour *evaluated* is not shown**, only what executed. Nothing in
  a run listing names a task, and reading each run's job log to find out would be two
  API calls per run — the cost the fold itself dropped for the same reason. Why a task
  declined its last ask is on its own row instead, from the verdict the item carries.

## Checks

Both are the digest's — nothing here polices the page, which is a page and not a
practice.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `digest-plain-text` | medium | correctness | check: blocking |
| `dated-fixture-collision` | medium | correctness | check: blocking |

# web-scraping — taking data from a site you don't own

The facet: a project whose input is another organisation's website, reached
without a contract. There is no support channel, no changelog and no SLA, so
every rule below is about **reducing what you have to re-learn** — from the site,
from the network, and from your own pipeline — when it changes underneath you.

A default to adapt, not a contract. Language-agnostic: "fetch", "parse" and
"normalize" mean whatever they mean on your stack.

## 1. Parse the data surface, not the page

Scraping rendered markup is the **last** resort. In order of preference: the
hydration blob a server-rendered app embeds in the page, then the JSON/GraphQL
endpoint a single-page app fetches its rows from, and only then the markup — where
you prefer the page's self-describing metadata (JSON-LD, `og:` tags) over element
positions, because metadata survives a redesign and `.results > div:nth-child(2)`
does not. Rendered snapshots are also **not deterministic**, so treat a shifted
expectation after a re-record the way you'd treat a markup change: re-review it,
don't assume a regression.

Finding that surface for a new site is a one-off reconnaissance job with its own
procedure — the [`map-a-data-source`](skills/map-a-data-source/SKILL.md) skill.

## 2. Write the reverse-engineering down once, in the repo

The expensive part of this work is not the code, it is the knowledge: endpoints,
auth, the field surface, the enum values, and every non-obvious behaviour you had
to discover by probing. Put it in a reference doc beside the scripts, and keep it
complete enough that **nothing needs to re-probe the live service to answer a
question**. Re-probing is slow, rate-limited, sometimes blocked, and occasionally
the thing that gets you banned.

## 3. Two on-disk forms: a regenerable cache and a committed raw record

Separate them deliberately:

- **The fetched artifact** (page HTML, raw response pages) is a cache — git-ignore
  it. It is large, regenerable, and not what you reason about.
- **The extracted raw record** — the site's own object, before any of your
  normalization — is **committed** and is the durable source of truth.

That split buys three things at once. Re-deriving your normalized output becomes an
**offline** operation, so a parser change costs no requests. The committed record
doubles as the fixture for a self-test of the transform that needs no network. And a
field you didn't parse this month is still there next month, because you kept the
whole object rather than the subset you needed at the time.

**Fetch only what's missing**, with an explicit flag to force a refresh — repeat runs
should be a no-op. Note what "resumable" is measured against: the file on disk. On a
CI runner that file is durable only once the job's commit step pushes it, so a
resumable script still loses everything if the runner itself dies. Chunk the work if
that matters.

## 4. A 200 is not success, and the convenient field is not the truth

- **Detect bot challenges.** An anti-bot interstitial arrives as a normal-looking
  200 (or a 403/503) whose body is a challenge page. Caching it stores garbage that
  looks like data. Match the known markers in the first few KB and report it as a
  distinct failure reason.
- **An empty body means nothing rendered.** Treat it as a failure of that fetch,
  not as an empty result — and don't retry it, since a successful-but-empty response
  will keep being successful and empty.
- **Prefer the authoritative status field over the convenience boolean.** Where a
  service exposes both a rich status enum and a summarizing flag, the flag is
  routinely wrong: an item can report "not sold out" while its status says there is
  nothing left to sell. Read the enum, and take its legal values from the service's
  own options endpoint rather than from what you happened to see.
- **Deny-list the bad statuses, don't allow-list the good ones**, and log the set
  actually observed. A new status then defaults to usable and shows up in your logs,
  instead of silently dropping rows.
- **Numbers may arrive as strings.** Parse; don't assume the JSON type.
- **A "cheapest" or "first" value can be a special case, not a value.** Filter to
  what the field means before you reduce over it — a zero-priced accessibility
  companion band makes the cheapest ticket for every show free.

## 5. Convert at the edge, exactly once — timestamps especially

Instants usually arrive in UTC while your domain thinks in local wall-clock. Slicing
digits out of the string files everything an hour off during daylight saving, and
**the result looks completely plausible** — nothing throws, nothing is empty, the
data is simply wrong. Do the conversion in one function at the ingestion boundary and
have everything downstream speak local time.

Because the failure is silent, keep a **known-answer probe**: an item whose correct
value you know independently (something named after its own time, a figure published
elsewhere). Check it after every fresh pull.

## 6. Missing is its own state — never fold it into zero or false

A record your pipeline hasn't reached yet is *unknown*, not *free*, *empty* or
*false*. Sources keep adding rows after your last full pass, so gaps are normal and
permanent. Carry unknown through the whole stack — omit the key rather than emitting
a default — and let each consumer render it as its own thing.

## 7. Fetch politely and defensively

- Browser-like headers, a randomized delay between requests, and exponential backoff
  on retry.
- **Retry only what can improve.** A gateway or proxy failure (408, 429, 500, 502,
  503, 504) is worth another attempt; any other 4xx is about your request and will
  answer the same way forever.
- **Carry the retry policy across a rewrite.** `curl --retry` covers exactly that
  status set; porting a fetch to a language-level HTTP client silently drops all of
  it, and the first transient 500 the old command would have ridden out kills the
  run.
- **Record and continue.** One unfetchable item should not abandon the batch — log
  the reason per item and emit a report.
- **Bound the retry budget by the caller's timeout.** Attempts times per-attempt
  timeout plus the waits must fit inside whatever hard limit kills the process, and
  the backoff should be injectable so tests exercise the retry path without sleeping
  through it.

## 8. One fetching module, and only sanctioned callers

Route **all** outbound page/API fetching through a single module, so swapping the
vendor, the proxy or the credential is one edit with one place to test.

Where that module may run is a policy question, not a convenience one:

- An agent sandbox is commonly **bot-blocked**, and its egress proxy may refuse the
  target host outright. That refusal is policy. **Do not route around it** — not with
  a local fetch, not with an ad-hoc workflow spun up to reach the host.
- Give the fetch one sanctioned home — a scheduled job or workflow on a runner, with
  the credential in repository secrets — and let sessions read the committed raw
  records instead.

**Reaching a commercial rendering proxy** is the standard answer when the target
blocks datacenter IPs or needs its JavaScript executed; ask it to render, and give it
a wait-for-selector when the content you want arrives late.

## 9. No bulk endpoint is not the same as no bulk request

When a service exposes a per-item query and no list variant, you can often still
batch: GraphQL lets one document alias the same field many times, and many REST APIs
accept a multi-id parameter. The cap is usually undocumented, so **halve a rejected
batch and retry** — that keeps batch size a throughput knob and never an accuracy
one.

## 10. Refresh each field on the clock it actually moves on

The single biggest cost saving in a scraper is noticing that its fields have
different volatility: some are fixed once published, some gain rows daily, some move
hourly. Give each its own pass and its own schedule instead of re-fetching everything
on the fastest clock — re-learning a static field nightly is thousands of requests
for the same answer, and it is the part of your traffic most likely to get you
blocked.

Then make the derived outputs a **pure function of the stored master**: refresh
writes to the master, and everything else regenerates from it. Files whose inputs
didn't change come back byte-identical and never enter the commit, so the diff of a
scheduled run is exactly what actually moved.

## 11. An unfetchable page is a dead end, not a pipeline failure

When a fetch cannot produce a page — a bot wall, a dead URL, an empty render — mark
the item for a human and **exit successfully**. Failing the run converges on the same
human signal while also implying the pipeline broke, when in fact it correctly
declined. The rest of the batch should still land.

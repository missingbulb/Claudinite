# web-scraping — taking data from a site you don't own

## Finding the data surface

- **Adding a source, or deciding what to parse** — scraping rendered markup is the **last**
  resort. Prefer, in order: the hydration blob a server-rendered app embeds in the page, then
  the JSON/GraphQL endpoint a single-page app fetches its rows from, and only then the markup
  — where you prefer the page's self-describing metadata (JSON-LD, `og:` tags) over element
  positions, because metadata survives a redesign and `.results > div:nth-child(2)` does not.
  Finding that surface on a new site is a one-off reconnaissance job with its own procedure,
  the [`map-a-data-source`](skills/map-a-data-source/SKILL.md) skill.

- **A rendered-snapshot expectation shifting after a re-record** — rendered output is **not
  deterministic**, so treat the shift the way you'd treat a markup change: re-review it, don't
  assume a regression.

- **Learning something non-obvious by probing the service** — write it down in a reference doc
  beside the scripts: endpoints, auth, the field surface, the enum values. Keep it complete
  enough that **nothing needs to re-probe the live service to answer a question**. The
  expensive part of this work is the knowledge rather than the code, and re-probing is slow,
  rate-limited, sometimes blocked, and occasionally the thing that gets you banned.

## Fetching

- **Writing the fetch itself** — browser-like headers, a randomized delay between requests, and
  exponential backoff on retry. Route **all** outbound page/API fetching through a single
  module, so swapping the vendor, the proxy or the credential is one edit with one place to
  test.

- **Deciding whether to retry a failed request** — retry only what can improve. A gateway or
  proxy failure (408, 429, 500, 502, 503, 504) is worth another attempt; any other 4xx is about
  your request and will answer the same way forever.

- **Porting a fetch to a language-level HTTP client** — carry the retry policy across the
  rewrite. `curl --retry` covers exactly that status set and the port silently drops all of it,
  so the first transient 500 the old command would have ridden out kills the run.

- **Setting the retry budget** — attempts times per-attempt timeout, plus the waits, must fit
  inside whatever hard limit kills the process, and the backoff should be injectable so tests
  exercise the retry path without sleeping through it.

- **One item in a batch failing to fetch** — record and continue. Log the reason per item and
  emit a report; one unfetchable item should not abandon the batch.

- **A sandbox refusing the target host** — an agent sandbox is commonly **bot-blocked**, and its
  egress proxy may refuse the host outright. That refusal is policy: **do not route around it**,
  not with a local fetch and not with an ad-hoc workflow spun up to reach the host. Give the
  fetch one sanctioned home — a scheduled job or workflow on a runner, with the credential in
  repository secrets — and let sessions read the committed raw records instead.

- **A fetch that works on your machine and fails from CI** — a 403/400 or a CAPTCHA wall from a
  runner or a sandbox is usually the *datacenter IP* being blocked, not the headers, so tuning
  them is wasted work. **Reaching a commercial rendering proxy** is the standard answer: a
  residential lane clears the IP block, and these services usually execute JavaScript too, so a
  single-page app records real content. Ask it to render, and give it a wait-for-selector when
  the content you want arrives late. A target that stays blocked even through the proxy is
  un-cacheable: say so and stop, rather than hunting for another route.

- **Needing many items from a service with no list endpoint** — no bulk endpoint is not the same
  as no bulk request. GraphQL lets one document alias the same field many times, and many REST
  APIs accept a multi-id parameter. The cap is usually undocumented, so **halve a rejected batch
  and retry** — that keeps batch size a throughput knob and never an accuracy one.

- **A fetch that cannot produce a page at all** — a bot wall, a dead URL, an empty render is a
  dead end, not a pipeline failure: mark the item for a human and **exit successfully**. Failing
  the run converges on the same human signal while also implying the pipeline broke, when in
  fact it correctly declined. The rest of the batch should still land.

## Reading what came back

- **Deciding whether a fetch succeeded** — a 200 is not success. An anti-bot interstitial arrives
  as a normal-looking 200 (or a 403/503) whose body is a challenge page, and caching it stores
  garbage that looks like data. Match the known markers in the first few KB and report it as a
  distinct failure reason.

- **Getting an empty body back** — nothing rendered. Treat it as a failure of that fetch rather
  than as an empty result, and don't retry it: a successful-but-empty response will keep being
  successful and empty.

- **Choosing which field to read** — prefer the authoritative status enum over the summarizing
  convenience boolean, which is routinely wrong: an item can report "not sold out" while its
  status says there is nothing left to sell. Take the enum's legal values from the service's own
  options endpoint rather than from what you happened to see.

- **Filtering rows by a status** — deny-list the bad statuses, don't allow-list the good ones,
  and log the set actually observed. A new status then defaults to usable and shows up in your
  logs, instead of silently dropping rows.

- **Reading a numeric field** — numbers may arrive as strings. Parse; don't assume the JSON type.

- **Reducing a set to its "cheapest" or "first"** — that value can be a special case rather than
  a value. Filter to what the field means before you reduce over it: a zero-priced accessibility
  companion band makes the cheapest ticket for every show free.

## Normalizing what you read

- **Converting an instant to the domain's local time** — instants usually arrive in UTC while
  your domain thinks in local wall-clock. Do the conversion in one function at the ingestion
  boundary and have everything downstream speak local time. Slicing digits out of the string
  files everything an hour off during daylight saving, and **the result looks completely
  plausible** — nothing throws, nothing is empty, the data is simply wrong. Because the failure
  is silent, keep a **known-answer probe**: an item whose correct value you know independently
  (something named after its own time, a figure published elsewhere), checked after every fresh
  pull. "Exactly once" cuts both ways — a stage downstream of the boundary that parses,
  re-offsets or re-reads a stored value as UTC is the same bug from the other end.

- **Taking a "now"** — read it in the domain's zone rather than off the device clock. A reviewer
  in the same zone as the developer cannot see the difference, which is how a device clock
  survives review.

- **Parsing a value whose format is ambiguous** — read it by what the page declares, centrally;
  never per-source, never guessed. A numeric slash date whose parts are both ≤ 12 (`05/07/2026`)
  has no intrinsic answer, so resolve it from a *positive* signal the document gives you (an
  explicit region in `<html lang>` or `og:locale`, a non-English language) and keep the default
  when the signal is absent or region-less, rather than inferring one from the host or the
  venue. Put that resolution in one helper the whole pipeline threads, so a new source cannot
  invent its own reading. A trailing `Z` or `+00:00` is *serialization*, not a claim about the
  subject's zone: it neither supplies the zone nor vetoes deriving one from what the page says
  about the place.

- **Changing the conversion** — it is a **full-snapshot change**. Committed derived data is
  generator output, so the fix isn't done until the raw record is re-run through the new
  conversion and every downstream artifact regenerated. Expect the boundary to move records
  between partitions — items at the end of a day land in the next one, and may fall outside the
  range your day-partitioned files cover — and check that rather than reading it as data loss.

- **Emitting a value your pipeline hasn't reached yet** — missing is its own state: *unknown*,
  never folded into *free*, *empty* or *false*. Sources keep adding rows after your last full
  pass, so gaps are normal and permanent. Carry unknown through the whole stack — omit the key
  rather than emitting a default — and let each consumer render it as its own thing.

## What lands on disk, and when it refreshes

- **Deciding what a fetch writes to disk** — two forms, separated deliberately. The fetched
  artifact (page HTML, raw response pages) is a **cache**: git-ignore it, since it is large,
  regenerable, and not what you reason about. The extracted raw record — the site's own object,
  before any of your normalization — is **committed**, and is the durable source of truth. That
  split buys three things at once: re-deriving your normalized output becomes an **offline**
  operation, so a parser change costs no requests; the committed record doubles as the fixture
  for a self-test of the transform that needs no network; and a field you didn't parse this
  month is still there next month, because you kept the whole object rather than the subset you
  needed at the time.

- **Re-running a fetch that already ran** — **fetch only what's missing**, with an explicit flag
  to force a refresh, so repeat runs are a no-op. Note what "resumable" is measured against: the
  file on disk. On a CI runner that file is durable only once the job's commit step pushes it,
  so a resumable script still loses everything if the runner itself dies. Chunk the work if that
  matters.

- **Scheduling the refresh** — give each field its own pass on the clock it actually moves on.
  The single biggest cost saving in a scraper is noticing that some fields are fixed once
  published, some gain rows daily and some move hourly: re-fetching everything on the fastest
  clock re-learns a static field nightly, thousands of requests for the same answer, and it is
  the part of your traffic most likely to get you blocked.

- **Generating the artifacts downstream of the stored data** — make them a **pure function of
  the stored master**: refresh writes to the master, and everything else regenerates from it.
  Files whose inputs didn't change come back byte-identical and never enter the commit, so the
  diff of a scheduled run is exactly what actually moved.

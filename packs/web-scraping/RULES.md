# web-scraping — taking data from a site you don't own

## Finding the data surface

- **A rendered-snapshot expectation shifting after a re-record** — rendered output is **not
  deterministic**, so treat the shift the way you'd treat a markup change: re-review it, don't
  assume a regression.

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

- **Emitting a value your pipeline hasn't reached yet** — missing is its own state: *unknown*,
  never folded into *free*, *empty* or *false*. Sources keep adding rows after your last full
  pass, so gaps are normal and permanent. Carry unknown through the whole stack — omit the key
  rather than emitting a default — and let each consumer render it as its own thing.

## What lands on disk, and when it refreshes

- **Deciding what a fetch writes to disk** — two forms, separated deliberately. The fetched
  artifact (page HTML, raw response pages) is a **cache**: git-ignore it, since it is large,
  regenerable, and not what you reason about. The extracted raw record — the site's own object,
  before any of your normalization — is **committed**, and is the durable source of truth.

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

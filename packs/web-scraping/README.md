# web-scraping pack

Declared (opt-in) by a project whose input is **another organisation's website**,
reached without a contract: no support channel, no changelog, no SLA. No
fingerprint — a scraper is ordinary HTTP client code, indistinguishable from a call
to an API the project owns.

Prose plus one skill, and no checks: every rule is about a *remote* service's
behaviour (which field is authoritative, whether an instant is UTC, when a 200 is a
bot wall), none of which is written into repo state in a shape a check could read
without firing on ordinary HTTP code.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Adding a source, or what to parse | medium | complexity | prose: 90 words |
| A rendered-snapshot expectation shifting after a re-record | medium | correctness | prose: 31 words |
| Learning something non-obvious by probing the service | medium | complexity | prose: 71 words |
| Writing the fetch itself | medium | correctness | prose: 44 words |
| Deciding whether to retry a failed request | medium | correctness | prose: 43 words |
| Porting a fetch to an HTTP client | medium | correctness | prose: 47 words |
| Setting the retry budget | medium | performance | prose: 38 words |
| One item in a batch failing | high | correctness | prose: 30 words |
| A sandbox refusing the target host | critical | legal | prose: 80 words |
| A fetch that fails only in CI | medium | correctness | prose: 108 words |
| Needing many items with no list endpoint | medium | performance | prose: 66 words |
| A fetch that cannot produce a page | medium | correctness | prose: 66 words |
| Deciding whether a fetch succeeded | high | correctness | prose: 55 words |
| Getting an empty body back | high | correctness | prose: 36 words |
| Choosing which field to read | high | correctness | prose: 57 words |
| Filtering rows by a status | high | correctness | prose: 40 words |
| Reading a numeric field | high | correctness | prose: 17 words |
| Reducing a set to its cheapest | medium | correctness | prose: 45 words |
| Converting an instant to local time | high | correctness | prose: 132 words |
| Taking a "now" | high | correctness | prose: 38 words |
| Parsing a value whose format is ambiguous | high | correctness | prose: 129 words |
| Changing the conversion | high | correctness | prose: 78 words |
| Emitting a value the pipeline hasn't reached | high | correctness | prose: 64 words |
| Deciding what a fetch writes to disk | medium | complexity | prose: 128 words |
| Re-running a fetch that already ran | medium | correctness | prose: 70 words |
| Scheduling the refresh | medium | correctness | prose: 75 words |
| Generating artifacts from the stored data | medium | correctness | prose: 55 words |

## Skill

| Skill | Trigger |
|---|---|
| [`map-a-data-source`](skills/map-a-data-source/SKILL.md) | adding a new source, or an existing one stopped parsing — locate the surface and write the reference doc before any parser exists |

Provenance: distilled from three fleet members that each take data from a site they
don't own.

| Member | What it evidenced |
|---|---|
| `missingbulb/EdFringeNow` | `scraper/SCRAPING.md` + `scraper/README.md` + `fetch_shows.py` / `fetch_prices.py` / `normalize.py`: the empty-SPA-shell → client GraphQL API read, reading the site's own JS bundles for the operation surface, the reference-doc-so-nothing-re-probes discipline, resumable paging with randomized delays, the status-enum-over-boolean and amounts-as-strings traps, UTC-at-the-edge, unknown≠free, alias batching with halve-on-reject, per-field refresh cadence, and derived-outputs-as-a-pure-function-of-the-master |
| `missingbulb/EdFringeAllocator` | `edfringe/fetch.py` + `edfringe/extract.py`: the hydration-blob surface, the git-ignored HTML cache vs the committed raw record with offline re-derivation, fetch-only-what's-missing, browser-like headers with exponential backoff, bot-challenge detection, deny-listing bad statuses, record-and-continue reporting, and its own UTC→local edge conversion |
| `missingbulb/GoogleCalendarEventCreator` | its extractor-pipeline rules and `scraperapi.mjs`: one fetching module as the whole surface, the rendering proxy with a wait-for-selector, the retryable-status set and how a rewrite drops it, empty-body-means-nothing-rendered, non-deterministic rendered output, preferring JSON-LD/`og:` over DOM positions, sandbox bot-blocking with the credential held by a runner, and unfetchable-page-is-a-dead-end |

Every rule above appears in at least two of the three, except the alias-batching and
per-field-cadence rules (**Needing many items from a service with no list endpoint**,
**Scheduling the refresh**), which are one member's — kept because they are plainly
general to any rate-limited source and their evidence is concrete.

## Consolidated into this pack

Once the facet had a home, prose that had been mis-homed for want of one moved here.
Each was already written; none is new material.

| What moved | From | Landed in |
|---|---|---|
| The datacenter-IP diagnosis: a fetch that works locally and 403s from CI is the IP, not the User-Agent; the residential/rendering proxy is the answer, and a target still blocked through it is un-cacheable | the baseline prose (deleted there in this change) | **A fetch that works on your machine and fails from CI** |
| Cross a time zone exactly once, at the ingest edge — including the downstream double-conversion and the device-clock "now" | `missingbulb/EdFringeNow`'s local `edfringe-data` pack | **Converting an instant to the domain's local time** (landed with the pack) and **Taking a "now"** |
| A conversion change is a full-snapshot change: regenerate from the raw record, and expect the boundary to move records between partitions | `missingbulb/EdFringeNow`'s local `edfringe-data` pack | **Changing the conversion** |
| Read an ambiguous value by what the page declares, centrally — the numeric slash date resolved from a positive locale signal, and `Z` as serialization rather than the subject's zone | `missingbulb/GoogleCalendarEventCreator`'s local `gcec` pack | **Parsing a value whose format is ambiguous** |

The basics deletion is done here. The two members' local copies are theirs to prune —
this session has no write access to either — so they are left for `growth-dedup` to
drop once this pack is declared there.

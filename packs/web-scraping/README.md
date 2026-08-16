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

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| Adding a source, or deciding what to parse | 90 | medium | complexity | prose |
| A rendered-snapshot expectation shifting after a re-record | 31 | medium | correctness | prose |
| Learning something non-obvious by probing the service | 71 | medium | complexity | prose |
| Writing the fetch itself | 44 | medium | correctness | prose |
| Deciding whether to retry a failed request | 43 | medium | correctness | prose |
| Porting a fetch to a language-level HTTP client | 47 | medium | correctness | prose |
| Setting the retry budget | 38 | medium | performance | prose |
| One item in a batch failing to fetch | 30 | high | correctness | prose |
| A sandbox refusing the target host | 80 | critical | legal | prose |
| A fetch that works on your machine and fails from CI | 108 | medium | correctness | prose |
| Needing many items from a service with no list endpoint | 66 | medium | performance | prose |
| A fetch that cannot produce a page at all | 66 | medium | correctness | prose |
| Deciding whether a fetch succeeded | 55 | high | correctness | prose |
| Getting an empty body back | 36 | high | correctness | prose |
| Choosing which field to read | 57 | high | correctness | prose |
| Filtering rows by a status | 40 | high | correctness | prose |
| Reading a numeric field | 17 | high | correctness | prose |
| Reducing a set to its "cheapest" or "first" | 45 | medium | correctness | prose |
| Converting an instant to the domain's local time | 132 | high | correctness | prose |
| Taking a "now" | 38 | high | correctness | prose |
| Parsing a value whose format is ambiguous | 129 | high | correctness | prose |
| Changing the conversion | 78 | high | correctness | prose |
| Emitting a value your pipeline hasn't reached yet | 64 | high | correctness | prose |
| Deciding what a fetch writes to disk | 128 | medium | complexity | prose |
| Re-running a fetch that already ran | 70 | medium | correctness | prose |
| Scheduling the refresh | 75 | medium | correctness | prose |
| Generating the artifacts downstream of the stored data | 55 | medium | correctness | prose |

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
| The datacenter-IP diagnosis: a fetch that works locally and 403s from CI is the IP, not the User-Agent; the residential/rendering proxy is the answer, and a target still blocked through it is un-cacheable | `packs/basics/RULES.md` (deleted there in this change) | **A fetch that works on your machine and fails from CI** |
| Cross a time zone exactly once, at the ingest edge — including the downstream double-conversion and the device-clock "now" | `missingbulb/EdFringeNow`'s local `edfringe-data` pack | **Converting an instant to the domain's local time** (landed with the pack) and **Taking a "now"** |
| A conversion change is a full-snapshot change: regenerate from the raw record, and expect the boundary to move records between partitions | `missingbulb/EdFringeNow`'s local `edfringe-data` pack | **Changing the conversion** |
| Read an ambiguous value by what the page declares, centrally — the numeric slash date resolved from a positive locale signal, and `Z` as serialization rather than the subject's zone | `missingbulb/GoogleCalendarEventCreator`'s local `gcec` pack | **Parsing a value whose format is ambiguous** |

The basics deletion is done here. The two members' local copies are theirs to prune —
this session has no write access to either — so they are left for `growth-dedup` to
drop once this pack is declared there.

# web-scraping pack

Declared (opt-in) by a project whose input is **another organisation's website**,
reached without a contract: no support channel, no changelog, no SLA. No
fingerprint — a scraper is ordinary HTTP client code, indistinguishable from a call
to an API the project owns.

Prose plus one skill, and no checks: every rule is about a *remote* service's
behaviour (which field is authoritative, whether an instant is UTC, when a 200 is a
bot wall), none of which is written into repo state in a shape a check could read
without firing on ordinary HTTP code.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Parse the data surface | prose (+ the `map-a-data-source` skill for the recon) |
| Write the findings down | prose |
| Cache regenerable, commit raw | prose |
| A 200 isn't success | prose |
| Convert timestamps at edge | prose |
| Missing isn't zero | prose |
| Retry only what improves | prose |
| One fetching module, sanctioned callers | prose |
| Batch without a bulk endpoint | prose |
| Refresh on each field's clock | prose |
| Unfetchable page, not failed run | prose |

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
per-field-cadence rules (§9, §10), which are one member's — kept because they are
plainly general to any rate-limited source and their evidence is concrete.

## Consolidated into this pack

Once the facet had a home, prose that had been mis-homed for want of one moved here.
Each was already written; none is new material.

| What moved | From | Landed in |
|---|---|---|
| The datacenter-IP diagnosis: a fetch that works locally and 403s from CI is the IP, not the User-Agent; the residential/rendering proxy is the answer, and a target still blocked through it is un-cacheable | `packs/basics/RULES.md` (deleted there in this change) | §8 |
| Cross a time zone exactly once, at the ingest edge — including the downstream double-conversion and the device-clock "now" | `missingbulb/EdFringeNow`'s local `edfringe-data` pack | §5 (landed with the pack) |
| A conversion change is a full-snapshot change: regenerate from the raw record, and expect the boundary to move records between partitions | `missingbulb/EdFringeNow`'s local `edfringe-data` pack | §5 |
| Read an ambiguous value by what the page declares, centrally — the numeric slash date resolved from a positive locale signal, and `Z` as serialization rather than the subject's zone | `missingbulb/GoogleCalendarEventCreator`'s local `gcec` pack | §5 |

The basics deletion is done here. The two members' local copies are theirs to prune —
this session has no write access to either — so they are left for `growth-dedup` to
drop once this pack is declared there.

# web-scraping pack

Declared (opt-in) by a project whose input is **another organisation's website**,
reached without a contract: no support channel, no changelog, no SLA. There is no
fingerprint, so declaring the pack is the only thing that activates it.

Prose plus one skill, and no checks.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Adding a source, or what to parse | medium | complexity | prose: <100 words |
| A rendered-snapshot expectation shifting after a re-record | medium | correctness | prose: <50 words |
| Learning something non-obvious by probing the service | medium | complexity | prose: <100 words |
| Writing the fetch itself | medium | correctness | prose: <50 words |
| Deciding whether to retry a failed request | medium | correctness | prose: <50 words |
| Porting a fetch to an HTTP client | medium | correctness | prose: <50 words |
| Setting the retry budget | medium | performance | prose: <50 words |
| One item in a batch failing | high | correctness | prose: <50 words |
| A sandbox refusing the target host | critical | legal | prose: <100 words |
| A fetch that fails only in CI | medium | correctness | prose: <200 words |
| Needing many items with no list endpoint | medium | performance | prose: <100 words |
| A fetch that cannot produce a page | medium | correctness | prose: <100 words |
| Deciding whether a fetch succeeded | high | correctness | prose: <100 words |
| Getting an empty body back | high | correctness | prose: <50 words |
| Choosing which field to read | high | correctness | prose: <100 words |
| Filtering rows by a status | high | correctness | prose: <50 words |
| Reading a numeric field | high | correctness | prose: <20 words |
| Reducing a set to its cheapest | medium | correctness | prose: <50 words |
| Converting an instant to local time | high | correctness | prose: <200 words |
| Taking a "now" | high | correctness | prose: <50 words |
| Parsing a value whose format is ambiguous | high | correctness | prose: <200 words |
| Changing the conversion | high | correctness | prose: <100 words |
| Emitting a value the pipeline hasn't reached | high | correctness | prose: <100 words |
| Deciding what a fetch writes to disk | medium | complexity | prose: <100 words |
| Re-running a fetch that already ran | medium | correctness | prose: <100 words |
| Scheduling the refresh | medium | correctness | prose: <100 words |
| Generating artifacts from the stored data | medium | correctness | prose: <100 words |

## Skill

| Skill | Trigger |
|---|---|
| [`map-a-data-source`](skills/map-a-data-source/SKILL.md) | adding a new source, or an existing one stopped parsing — locate the surface and write the reference doc before any parser exists |

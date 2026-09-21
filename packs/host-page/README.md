# host-page

Being a guest in a web app you do not own: reading its DOM, driving it with synthetic input,
watching it change, and injecting your own UI into it — against markup that can be redesigned
without notice and code that will not throw when it is.

Sibling packs on the same axis: `web-scraping` (acquiring a site's data from outside it, rather
than operating it from within), `chrome-extension` (how your code reaches the page at all —
manifest, permissions, content-script registration), `headless-browser` (driving a browser you
own, from outside the page).

Declared by hand: nothing in this pack fingerprints, so a project must declare `host-page` in
its `.claudinite-settings.json` for these rules and checks to apply.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Quarantine host DOM knowledge in one module | high | complexity | prose: <100 words |
| Identify host UI by a net | high | correctness | prose: <100 words |
| Record what selectors were verified against | medium | complexity | prose: <100 words |
| Ship a probe that never throws | medium | correctness | prose: <200 words |
| Mirror the host in a fixture | medium | correctness | prose: <100 words |
| Verify every write by re-reading | critical | correctness | prose: <100 words |
| A synthetic keystroke carries the legacy fields | high | correctness | prose: <100 words |
| Restore borrowed host state | medium | correctness | prose: <100 words |
| Check the host's overlay states before diffing | high | correctness | prose: <100 words |
| Nudge the host's idle timers | medium | correctness | prose: <100 words |
| Be inert when you are off | high | performance | prose: <200 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `page-observers-disconnected` | high | performance | check: blocking |
| `synthetic-input-events-bubble` | high | correctness | check: blocking |
| `synthetic-input-events-target-app-node` | high | correctness | check: blocking |

Three checks, one shared failure mode: each catches a breach whose only symptom is the host page
**not responding**, which reads identically to "the app rejects untrusted events". Each is
deliberately narrow: the observer check asks a file-scoped question rather than attempting
data-flow analysis, and both event checks are scoped to the interfaces that model real user
input, so a `CustomEvent` you dispatch to your own listener is left alone. Everything else in
`RULES.md` stays prose, judgment about a host whose markup this repo cannot see.

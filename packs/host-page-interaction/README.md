# host-page-interaction pack

A practice pack (prose-only, declared — no fingerprint) for driving a web page you don't own: a
browser extension's content script, a userscript, a browser-automation tool, or a scraper that also
has to click and type. Distilled from a browser-extension content script that reads, types into, and
watches a large third-party single-page app.

## Rules (`RULES.md`)

| Rule | Enforcement |
|---|---|
| Quarantine the host's DOM knowledge in one module | prose |
| Identify host UI by a net, not by a single selector | prose |
| Write down what you verified the selectors against, and when | prose |
| Ship a probe, and make a broken page a finding rather than an exception | prose |
| Mirror the host in a fixture, and let the fixture define the expected shape | prose |
| Never trust a write — verify by re-reading | prose |
| A synthetic keystroke must carry the fields a real one would | prose |
| Put back any host state you borrowed, and degrade when you cannot read it | prose |
| The host has a lifecycle of its own, and its blank states are not your user's doing | prose |
| Be inert when you are off | prose |

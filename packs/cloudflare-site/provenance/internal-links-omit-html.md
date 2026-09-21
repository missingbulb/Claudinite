## 2026-09-21 · born · Workers static assets redirects the `.html` form (#2206)
- **Source:** promoted from a member's local pack by the growth-promote run.
- **Reason:** Workers static assets serves a page at its extensionless path and 307s the `.html`
  spelling there, so spelling it out costs every visitor a redirect that buys nothing.
- **Mechanism:** prose in `RULES.md` — the moment is writing an internal link, which no check can
  see before the link ships; a build-time link scan was not built for a rule this small.
- **Actor:** @missingbulb (owner), on the growth-promote run's pull request.
- **Model:** Opus 5
- **Landed:** #2206

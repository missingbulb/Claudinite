## 2026-09-05 · born · Promote three member packs onto the canon shelf (#1693)
- **Source:** CrosswordChat's local `host-page-adaptation` pack.
- **Reason:** `web-scraping` acquires a site's data from outside it, `chrome-extension` covers
  reaching the page, and `headless-browser` drives a browser you own, none of the three covers
  what to do once you are inside somebody else's page, so this pack opened for that gap.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest, declared by hand: a content script, a `dispatchEvent` and a
  `MutationObserver` are equally the shapes of code running on its own page, so no honest
  fingerprint tells a guest from a host.
- **Rejected:** a fingerprint-based declaration, which would suspect the pack in every DOM repo in
  the fleet.
- **Landed:** #1693 (Refs #1692) · pack version 60904.1.

## 2026-09-05 · born · Promote three member packs onto the canon shelf (#1693)
- **Source:** PR #1693 body.
- **Reason:** host-page is new — no canon pack covered being a guest in a web app you do not own:
  `web-scraping` acquires a site's data from outside it, `chrome-extension` covers how code reaches
  the page, `headless-browser` drives a browser you own. Generalized off CrosswordChat's
  local/host-page-adaptation, with its evidence citations (the `xwd__` token, `page-adapter/`, the
  REQ ids, the fixture paths) stripped.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest.
- **Rejected:** a coded fingerprint to activate the pack automatically — a content script, a
  `dispatchEvent` and a `MutationObserver` are equally the shapes of code running on its own page,
  so no marker can tell a guest from a host; declared by hand instead.
- **Landed:** #1693 (Refs #1692) · pack version 60904.1.

## 2026-09-05 · born · Promote three member packs onto the canon shelf (#1693)
- **Source:** CrosswordChat's `local/host-page-adaptation`, generalized onto the shelf by the #1691
  consolidation of the fleet's local packs, with its member-specific citations stripped (the `xwd__`
  token, `page-adapter/`, the REQ ids, the fixture paths).
- **Reason:** no canon pack covered operating a web app from inside a page you do not own:
  web-scraping acquires a site's data from outside it, chrome-extension covers how your code reaches
  the page and says nothing about what to do once it is there, and headless-browser drives a browser
  you own.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest, declared by hand: declaration is the only thing that activates
  it.
- **Rejected:** a detection fingerprint. The shapes that would suggest the pack - a content script,
  a `dispatchEvent`, a `MutationObserver` - are equally the shapes of code running on its own page,
  so a marker that cannot tell a guest from a host would suspect the pack in every DOM repo in the
  fleet.
- **Landed:** #1693 (Closes #1692) · pack version 60904.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

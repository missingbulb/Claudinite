## 2026-09-13 · born · converted from references.md (check:cloudflare-site/beacon-token-is-not-committed)
- **Reason:** A committed beacon token beacons from every checkout, fork and local preview into the
  production site's numbers, and the page is identical either way.
- **Mechanism:** a check
- **Retire when:** Retire it if the loader stops taking its token from the served file.

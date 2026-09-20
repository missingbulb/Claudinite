## 2026-09-18 · born · converted from references.md (RULES-1)
- **Reason:** The trap is that every local preview — `file://`, `python -m http.server`, most dev
  servers — serves the site at a domain root, so a root-relative URL is correct there and wrong
  only once deployed, where nothing reports it but a 404 on the live page. A **custom domain** moves
  the site back to the root and makes the rule moot for that repo, which is why the rule states the
  subpath as the default rather than as an absolute.
- **Mechanism:** prose
- **Retire when:** Retire it if these sites ever standardise on custom domains, or if the local
  preview is replaced by one that serves from the repo subpath.

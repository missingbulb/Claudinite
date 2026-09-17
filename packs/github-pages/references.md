# github-pages — why its rules exist

Maintenance and review only: the reason behind each rule, written so a later pass can reaffirm or
retire it. No session loads this file and no rule points a reader here.

- **(RULES-1)** The trap is that every local preview — `file://`, `python -m http.server`, most
  dev servers — serves the site at a domain root, so a root-relative URL is correct there and
  wrong only once deployed, where nothing reports it but a 404 on the live page. A **custom
  domain** moves the site back to the root and makes the rule moot for that repo, which is why
  the rule states the subpath as the default rather than as an absolute. Retire it if these sites
  ever standardise on custom domains, or if the local preview is replaced by one that serves from
  the repo subpath.

- **(check:gp/pages-workflows)** The pipeline runs entirely from the repo's own `.github/` because
  GitHub resolves a reusable workflow or a composite action only from there, never from the shared
  mount — so the pack holds the templates and each repo hosts a managed copy. A missing leg is a
  release that half-runs: a bumped version with no deploy, or a deploy of an untested tree. The
  `build_vars` arm exists because declaring a build variable against a vendored copy that predates
  the exporter reads the key, ignores it, and builds with the variable unset — silent all the way
  to the live page. Retire the check if the vendored surface is ever replaced by something the
  member cannot hold a stale copy of.

# cloudflare-site — why its rules and checks read as they do

Maintenance and review only: the reasons behind this pack's prose and checks, for the pass that
asks whether each still earns its place. No session loads this file.

- **(check:cloudflare-site/publishes-a-site-directory)** `assets.directory` is the only boundary
  between the published site and the repo holding the vendored mount, the packs and the queue's
  workers. Widening it to the repo root publishes all of that to a public URL, and the deploy
  reports success either way. Retire the check if a Cloudflare deployment ever gains a second,
  independent statement of what is uploaded.

- **(check:cloudflare-site/version-stamp-matches-package)** The stamp is a generated copy of
  `package.json`'s version, and a copy that drifts names a build that was never served while the
  page looks perfectly normal. Retire it if the version stops being copied into the pages.

- **(check:cloudflare-site/no-second-publisher)** A workflow that deploys ships the tree with no
  version cut, no gate and no park lane; a `CNAME` file under the published tree is the previous
  host still claiming the domain. Both are leftovers rather than choices, which is why they are
  detected rather than handed to an adopter as checklist items — a checklist of steps that are
  no-ops for most adopters teaches its reader to skim it (owner, 2026-09-13: "It should not
  include turning off other registrars or disabling github pages as optional steps, so they need
  to be evaluated if they are there"). Retire it if the release ever becomes idempotent against a
  second publisher.

- **(check:cloudflare-site/beacon-token-is-not-committed)** A committed beacon token beacons from
  every checkout, fork and local preview into the production site's numbers, and the page is
  identical either way. Retire it if the loader stops taking its token from the served file.

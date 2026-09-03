---
name: diagnosing-mount-staleness
description: Judging whether a member's vendored Claudinite mount is current, and answering why it did not update — which stamp fields carry the mount's version and which artifacts to read before blaming a platform setting. Use when asked whether Claudinite is current here, or when a converge failed or the mount did not update.
---

- **Judging whether Claudinite is current here** — read the stamp's `engineVersion` and
  `packVersions`, never `claudinite.updated` or `ref`: the versioned flows stamp versions and
  nothing else, so those two hold the provenance of the last full re-vendor rather than of this
  mount, and a member converging nightly reads as weeks stale.

- **Answering "why did the mount not update"** — read the member's own artifacts (its declaration,
  its stamp, the head sha's runs) before theorizing about a platform setting; propose a settings
  change as a conclusion, never as a diagnosis.

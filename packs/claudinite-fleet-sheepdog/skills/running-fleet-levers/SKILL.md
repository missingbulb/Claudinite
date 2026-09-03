---
name: running-fleet-levers
description: Operating the fleet enforcer's manual levers — pushing canon to every member now, adding a pack across the fleet, granting or repairing FLEET_GITHUB_TOKEN. Use when dispatching a fleet run by hand or when a sweep reports 403 or no-permission.
---

# Running the fleet levers

## The manual levers

- **Pushing canon to the whole fleet now** — create the work item, from a checkout of this repo:

  ```
  node .claudinite/shared/packs/claudinite-tasks/queue/create-work-item.mjs claudinite-fleet-sheepdog/fleet-baseline
  ```

  Add `--context "REPOS=owner/a owner/b"` to narrow it (space-separated: a Context line splits on
  commas), `--context "DRY_RUN=true"` to see the list without dispatching, or
  `--context "INCLUDE_DORMANT=true"` to reach members that stopped their own scheduler on purpose.
  Both knobs are read from the item's Context and nowhere else — an item created without them runs
  unscoped and live. It queues one run per member and then FOLLOWS each to canon's published engine
  and pack versions, reporting per member whether it converged, was already current, or never got
  there — never a count of accepted dispatches. A member with nothing to do reads `already-current`,
  which is a success, so over-using it is wasteful rather than unsafe.

- **Adding a pack across the fleet** — create a `fleet-add-missing-packs` item with
  `--context "ADD_PACKS=…"` rather than editing anything. No pack is named anywhere in this pack's
  code: every id comes from config or from the item's own Context, which is what keeps the
  enforcer from becoming a second place packs are known.

## Credentials

- **Granting or repairing `FLEET_GITHUB_TOKEN`** — a fine-grained PAT spanning the owner's
  repositories, granted exactly what [`fleet-token.mjs`](../../fleet-token.mjs)'s table names — the
  only place the permissions are written, because a per-sweep subset is always a defensible answer
  and never the right one. Grant it whole: the token is granted once, for the pack.

- **A sweep reporting `403` or `no-permission`** — the grant is short a permission, which the
  error names. It is a grant to fix once, so widen the token rather than re-running: no sweep
  retries, because a work list nobody will act on is not a green outcome.

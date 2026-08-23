# claudinite-fleet-sheepdog — the fleet enforcer marker

Declaring this pack marks a repo as the **fleet enforcer**: the one repo that covers and maintains
every repo under an owner. What the pack *is* — its six sweeps, their schedule, their reports, the
config schema — is [README.md](README.md). This file is what a session **here** has to get right.

## Configuring the fleet

- **Keeping a repo out of the fleet** — add its full `owner/name` to `exclude` on this pack's
  config entry. Nothing else opts a repo out: an archived or forked repo is reported as out of scope
  but still walked, and a repo that simply never adopted is `uncovered`, which is a finding rather
  than a choice. If a repo should not be measured, say so in `exclude` and the reports stop asking
  about it.

- **Adding or changing a `packSeeds` entry** — get it right *before* the sweep next runs. The
  sweep seeds and never overrides, so a wrong seed reaches each member exactly once and then sticks;
  correcting it here un-writes nothing, and undoing it is a change in every member's repo. Land the
  entry and its own declaration together, then read the next run's report rather than assuming.

- **Declaring a pack this fleet also seeds** — write the same config in both places, spelling
  every default out on both sides rather than leaving one implicit. `seeds-agree` compares them
  literally, because nothing in this pack may know what one pack's absent key means. A pack the
  fleet standardizes on but this repo does not itself run has nothing to agree with, and is fine.

## Acting on what a sweep reports

- **Acting on an `add-packs` work-list issue** — the work is a declaration and a reviewed PR **in
  the named member**, never here. A session in this repo is scoped to this repo, so if every item
  names another repo there is nothing here to do: say the scope is the blocker rather than writing
  to the issues, which are the only thing within reach and are not the work.

- **Acting on a scanned pack suggestion** — it is a recommendation, never a verdict.
  A fingerprint is a way to *suspect* a pack is wanted; whether to declare it is the member's call,
  and closing the issue `not planned` is a standing answer the scan honours rather than re-opening.
  A **forced** addition is the other thing entirely — a decision already made — so adopt what
  its issue says instead of re-judging whether it was wanted.

- **Reading `unknown` in a report** — it means the sweep could not look, not that it looked and
  found nothing. Never convert one into a verdict: a repo whose declaration could not be read is
  neither covered nor uncovered, an undecided fingerprint is not a non-match, and a member the
  pack-seed sweep could not reach is not converged. Fix the access and re-run.

- **Judging whether a member is behind** — compare `engineVersion` and `packVersions` against
  canon, never the age of its stamped `ref`. The update flows deliberately never rewrite `ref` or
  `updated`, so the stamp is provenance — which commit first vendored the mount — and stays
  frozen on a member that is perfectly current. Its age measures nothing, and measuring it
  calls the whole fleet behind on one arbitrary day.

- **Answering why the fleet did not move** — read the member's own artifacts first: its
  declaration, its stamp, the runs on its head sha. This repo dispatches; each member converges
  itself, with its own token and its own delivery policy. Propose a settings change as a conclusion,
  never as the diagnosis.

## Running the manual levers

- **Pushing canon to the whole fleet now** — create the work item, from a checkout of this repo:

  ```
  node .claudinite/shared/engine/scheduler/queue/create-work-item.mjs claudinite-fleet-sheepdog/fleet-baseline
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
  repositories, granted exactly what [`fleet-token.mjs`](fleet-token.mjs)'s table names — the only
  place the permissions are written, because a per-sweep subset is always a defensible answer and
  never the right one. Grant it whole: the token is granted once, for the pack.

- **A sweep reporting `403` or `no-permission`** — the grant is short a permission, which the
  error names. It is a grant to fix once, so widen the token rather than re-running: no sweep
  retries, because a work list nobody will act on is not a green outcome.

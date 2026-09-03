# claudinite-fleet-sheepdog — the fleet enforcer marker

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

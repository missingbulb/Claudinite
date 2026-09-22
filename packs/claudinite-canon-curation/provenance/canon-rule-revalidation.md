## 2026-09-15 · born · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Reason:** the growth sweeps declared a local-pack write surface but a config key widened them
  onto the canon shelf, so every canon-side run produced a diff its own policy could not cover and
  parked. A pack owns a corpus rather than a config key naming one; widening the growth policy would
  have authorised every member's growth task to write a tree it must never touch.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the canon twin of the growth pack's revalidation run, loading the new
  `revalidating-rules` skill rather than copying its method. It states no `repo-active` term: its
  trigger is a platform moving, which no repo-side signal sees, and every declaring member reads the
  shelf whether or not this repo was touched. It declares `amend_existing_or_create_new_pr`, per the
  rule that a run recomputing the whole answer accumulates one pull request.
- **Landed:** #2047 (Closes #2044) · pack version 60915.3.

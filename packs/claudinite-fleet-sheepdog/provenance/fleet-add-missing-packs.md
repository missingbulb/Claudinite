## 2026-08-10 · born · the fit sweep becomes a parameterised add-packs task (#741)
- **Source:** the `fleet-fit` sweep, which answered only "what might a member want that it does not
  declare", by fingerprint, weekly.
- **Reason:** the owner's other question has the same shape and had no home: put this pack on these
  repos, with this config, now. Both questions share their second stage entirely, so a second task
  would have duplicated the agent stage only to change the work list's provenance.
- **Actor:** @missingbulb (owner).
- **Mechanism:** one task with parameters and no defaults, each call site stating what it wants in
  full: the weekly run on the command line, a forced run through the scheduler's override bag.
  `all-covered-members` is a keyword a caller sends, so no call site can reach the whole fleet by
  omission, and a force refuses outright on an unknown pack id, a non-member target, the fleet
  keyword, or an unanswered interview question.
- **Landed:** #741.

## 2026-08-22 · reworded · the canon clone is disposed through the shared tree delete (#1222)
- **Reason:** the `ENOTEMPTY` race on a temp `.git` had been closed three times and come back twice,
  because each fix repaired the one call site that happened to fail while every other site kept
  spelling its own bare delete.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1222 (Closes #1219) · pack version 60822.1.

## 2026-09-13 · policy-changed · the fit sweep honours the ignore list (#1976)
- **Reason:** the sweep never consulted `exclude` at all, so a repo the fleet was told to leave
  alone could still be fingerprinted and handed a work-list issue. A force naming one is now refused
  rather than written around.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the ignore list is read in the fit sweep's own walk, before a declaration is.
- **Landed:** #1976 (Closes #1975) · pack version 60913.1.

## 2026-09-21 · born · an advisory guard fires in most sessions and the call runs anyway (half the sessions) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** An advisory guard firing in most sessions and the call running anyway means the guard
  is matching calls it was not written for, or naming a bias sessions do not hold. Half is where it
  stops being occasional and starts being noise a session learns to read past.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `probable` and the list is
  open, so a reader may find a cause outside it.
- **Retire when:** the rule has not fired in two months of the review's history, or its findings
  have produced no merged proposal - either says the threshold is wrong or the rule is not worth
  the reading.
- **Landed:** #2214

## 2026-09-22 · reworded · the floor asks how busy the repository was, not how often the sweeps ran (#2214)
- **Source:** the owner's reading of the first production review, 2026-09-22.
- **Reason:** the floor read `runs` or `sessions`, and `runs` is one global number the window
  carries once - 2276 against every subject alike, identical in every finding. A denominator that
  does not move cannot decide whether a window is worth judging, so the floor passed always and the
  rule was never gated at all. The blend it now reads moved 8.4x between the two windows this was
  calibrated on (453 against 54), which is the discrimination the old figure never had.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Rejected:** a per-subject opportunity count - how often THIS check could have fired - which is
  the measure that would also settle a check whose scope selects nothing. The owner chose the single
  blended rate as the simpler start and different bars per subject kind; the opportunity measure is
  filed rather than built.
- **Retire when:** a window's findings turn out uncorrelated with the blend.
- **Landed:** #2214

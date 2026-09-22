## 2026-09-21 · born · never fires and has no prose twin (no finding over twenty runs) (#2214)
- **Source:** docs/usage-review/DESIGN.md §3, the owner's design of 2026-09-21, implemented as
  written.
- **Reason:** Deliberately recommends nothing. A net that has caught nothing is not evidence of a
  hole, and the corpus has more checks than a month's work touches; the finding exists so the set is
  visible and so a check that is genuinely unreachable can be found among them.
- **Mechanism:** a declaration in `usage-rules.json`, not code - a threshold a reader must be able
  to weigh has to be readable without opening a module. The cause is `unknown` and the list is open,
  so a reader may find a cause outside it.
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

## 2026-09-22 · strengthened · the rule excludes what its sibling claims (#2214)
- **Reason:** it carried no `and`, so it fired for every check with no findings including the ones
  the prose-twin rule already claimed - and said "and has no prose twin" while testing nothing of
  the sort. The first production review reported `scheduler-workflows-are-thin` twice, under two
  rules and two different causes, which is what a reader weighing 54 findings has to discount by
  hand.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** `and: "!proseTwin"`. The evaluator gained a `!` prefix on a live predicate rather
  than a second grammar: two rules reading one record half need to split the subjects between them,
  and negation is the whole of what that takes. Unknown still propagates - a predicate that could
  not be read is unread whichever way the rule asked.
- **Landed:** #2214

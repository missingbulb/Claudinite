## 2026-08-14 · born · a member that has lost this pack's declaration (#836)
- **Reason:** the third state neither the dependency edge nor the seed record covers: an entry
  deleted by hand in a repo whose other packs still hold the declaration open. It reports; it cannot
  rescue.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded rule in this pack, advisory to start on the conformance-workflow precedent,
  because blocking would have turned every member red on its very next converge, before the seed
  record reached it.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-15 · severity-changed · the declaration check goes blocking (#844)
- **Reason:** the seed record has reached the fleet, so the advisory grace the rule shipped under
  has done its job.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the rule's severity alone; nothing about what it reads changes.
- **Landed:** #844.

## 2026-08-16 · converted · into a declared check (#891)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a `requireValueInArray` row in this pack's `declared-checks.json`, reading the
  member's own declaration for this pack's entry.
- **Landed:** #891.

## 2026-08-19 · reworded · the check id follows the pack's rename (#1029)
- **Reason:** the id named the pack, so it could not survive the rename. Worth its own record: a
  check id appears in members' `accept` lists and no alias facility exists for one, so this was a
  real vocabulary change made only because the rule is blocking-critical and not meaningfully
  waivable.
- **Actor:** @missingbulb (owner).
- **Landed:** #1029 (Closes #1022) · pack version 8.

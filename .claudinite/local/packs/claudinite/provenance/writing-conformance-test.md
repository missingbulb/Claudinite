## 2026-09-17 · born · converted from references.md (RULES-94)
- **Reason:** 2026-09-16's capture on #2089 (session 2f6cc995, 20:44:14–20:47:13): six rules
  across five packs went in without their README rows, and `rule-index.test.mjs`'s first subtest
  asserts inside its per-pack loop, so each run named one pack. The session re-ran the same file six
  times, ~3 minutes, to collect faults one loop iteration would have reported together.
- **Mechanism:** prose
- **Retire when:** Retire the rule if the repo stops carrying whole-shelf conformance tests.

## 2026-09-01 · born · converted from references.md (check:rules-index-current)
- **Reason:** #807: the rules index is the only channel a pack's prose reaches a session on, and the
  loss of it is invisible from inside the session — going red is the only available signal.
- **Mechanism:** a check
- **Retire when:** Retire the check only if a second delivery channel exists.

## 2026-09-21 · severity-changed · the one import no checkout can satisfy is exempt (#2188)
- **Reason:** the index now carries a literal import of the pack poured for the person in front of
  the session, written every session and tracked by nobody. Judged against the committed tree it
  read as a dangling import, so the rule went red in every repo that had the feature at all -
  which the vendoring rehearsals caught as 78 failing fixtures.
- **Actor:** @missingbulb (owner).
- **Mechanism:** unchanged carrier and severity - still blocking. Its gate skips imports under the
  engine's session pack root, read from the engine constant so the rule can never disagree with the
  generator about which root that is; a member whose engine predates the constant matches nothing,
  which is right there since such an engine writes no such import either.
- **Landed:** #2188

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268

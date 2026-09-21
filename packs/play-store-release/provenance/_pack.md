## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Reason:** registered as a stub carrying a scope statement and nothing else, so shipping to
  Google Play has a declared home and a routing target before any practice is captured; the canon is
  distilled from worked examples rather than written from imagination, so the rules wait for a
  project to ship there for real. Registered in one batch with android, ios and the other store
  pack, on the lifecycle the flutter pack had just completed. The project expected to fill it is
  ShoutsAndWhispers, and the shape expected of it is the chrome-extension pack's release half: a
  standard skill plus conformance checks.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, declared rather than fingerprinted. A release surface has no
  tracked file to key on, so a project declares the pack when it first ships there and a fingerprint
  waits for the first exercised release to wire one.
- **Landed:** #165 (Refs #180) · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers. It changes nothing a
  session does, every session in every declaring repo paid for it, and the README and the manifest's
  `ruleRoutingGuidance` already carried it. Across the corpus the sweep took non-rule prose from
  2,900 words to 1,080.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Refs #1632) · pack version 60902.1.

## 2026-09-05 · moved · Rules → skills: the audit's path-forced extractions; description-triggered ones stay prose (#1667)
- **Reason:** with the framing gone the prose file held only the stub note, and an absent prose file
  contributes nothing where that note cost every session four lines. The note is what an adopter
  needs rather than what a session needs, so it went to the README and the prose file was deleted
  rather than kept.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the pack README; the pack declares no prose file at all.
- **Landed:** #1667 (Refs #1662) · pack version 60903.1.

## 2026-09-21 · reaffirmed · the entries above cite Refs where each pull request closed its issue
- **Source:** the pull request bodies, read directly rather than through the commit trailer: #165
  opens `Closes #180`, #1634 `Closes #1632`, #1667 `Closes #1662`.
- **Reason:** the backfill took each linkage from the commit trailer, which says `Refs` in all
  three, and the brief derives it the same way. `Closes` is what filled GitHub's development panel
  and resolved the issue, so the entries above send a reader tracing this pack's closed work to a
  cross-reference instead. Nothing else in them changes.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5
- **Landed:** #2213.

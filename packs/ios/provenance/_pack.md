## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Reason:** registered as a stub carrying a scope statement and nothing else, so the surface has a
  declared home and a routing target before any practice is captured; the canon is distilled from
  worked examples rather than written from imagination, so the rules wait for a project to exercise
  it for real. Registered in one batch with android, play-store-release and app-store-release, on
  the lifecycle the flutter pack had just completed. The material expected to fill it is
  ShoutsAndWhispers' iOS configuration at its Firebase release milestone.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by `ios/Runner/Info.plist`.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers. It changes nothing a
  session does, every session in every declaring repo paid for it, and the README and the manifest's
  `ruleRoutingGuidance` already carried it. Across the corpus the sweep took non-rule prose from
  2,900 words to 1,080.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-05 · moved · the stub note leaves the prose file for the README (#1667)
- **Reason:** with the framing gone the prose file held only the stub note, and an absent prose file
  contributes nothing where that note cost every session four lines. The note is what an adopter
  needs rather than what a session needs, so it went to the README and the prose file was deleted
  rather than kept.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the pack README; the pack declares no prose file at all.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.

## 2026-09-06 · reworded · the stub framing leaves the manifest (#1671)
- **Source:** the growth-promote run of 2026-08-22 over the members whose local packs moved in that
  window, missingbulb/ClaudiniteWebsite, EdFringeNow, TLDR and WIP; the run's own pull request
  (#1204) was closed in favour of this consolidation, which is where the text landed. The evidence
  names the members as a set rather than one per rule.
- **Reason:** the pack's first two rules landed, so it is no longer a stub: the manifest header's
  stub note and expected-first-source line go, the README stops announcing that nothing is captured
  yet, and a `RULES.md` returns for the rules to live in.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1671 (Refs #1202, #1308, #1408, #1435, #1657, #1672) · pack version 60906.1.

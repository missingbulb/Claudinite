## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the document-structure pitfalls of hand-authored HTML recur regardless of framework
  and hold for any page read cold, so they are portable enough to be a pack of their own rather than
  rules inside whichever project pack first met them. Opened with the whole pack layer, as one of
  the technology packs the architecture was designed around.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, prose-only and with no fingerprint. Hand-authored HTML has no
  reliable structural signature, so declaration is authoritative and the drift check that would
  otherwise suspect the pack in a repo or clear it from one runs in neither direction.
- **Landed:** #128 (Refs #127, #131) · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers. It changes nothing a
  session does, every session in every declaring repo paid for it, and the README and the manifest's
  `ruleRoutingGuidance` already carried it. Across the corpus the sweep took non-rule prose from
  2,900 words to 1,080.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Refs #1632) · pack version 60902.1.

## 2026-09-21 · reaffirmed · the entries above cite Refs where each pull request closed its issue
- **Source:** the pull request bodies, read directly rather than through the commit trailer: #128
  opens `Closes #127` and `Closes #131`, #1634 `Closes #1632`.
- **Reason:** the backfill took each linkage from the commit trailer, which says `Refs` in both, and
  the brief derives it the same way. `Closes` is what filled GitHub's development panel and resolved
  the issue, so the entries above send a reader tracing this pack's closed work to a cross-reference
  instead. Nothing else in them changes.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5
- **Landed:** #2213.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

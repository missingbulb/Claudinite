## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** one project had exercised Firebase across rules, functions, messaging and deploy far
  enough for the practices to read as portable, so the pack was written filled rather than
  registered as a stub. Environment separation - the dev/prod split, App Check, store gating - was
  deliberately kept out: it is a decision a project takes once, when shipping gets close, and it
  landed beside this as the opt-in firebase-release pack instead.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by a `firebase.json` at the repo root - the one
  config every Firebase repo carries.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-07-08 · policy-changed · the fingerprint matches a firebase.json one directory down (#190)
- **Source:** missingbulb/ShoutsAndWhispers, which had just moved its Firebase files into
  `firebase/` and went undetected.
- **Reason:** a Firebase project root is the directory holding `firebase.json`, not necessarily the
  repo root - the CLI walks up to find the file and resolves every path inside it relative to that
  file, so a dedicated subfolder needs no config edits and is a legitimate common layout. Matching
  at the root only left such a repo needing a per-repo acceptance to stay honest. One directory down
  and never deeper is the bound, so a fixture or example tree cannot trip detection; flutter and
  node already fingerprinted that way.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `detect` on the pack manifest, matching `firebase.json` at depth one or two.
- **Landed:** #190 · pack version 1.

## 2026-08-20 · merged · the firebase-release pack is absorbed here (#1081)
- **Reason:** the release standard stops being a declaration a repo adds and becomes a skill of this
  pack; the reasoning is on the create-release-plan entry of this date. The collapse goes through
  the engine's rename map and a declaration-converging record, so a member that declared the
  absorbed pack resolves to this one.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1081 (Closes #1079) · pack version 4.

## 2026-09-01 · reaffirmed · the rationale #467 cut is recovered into a references file (#1575)
- **Reason:** mining every commit that shrank a still-standing canon rule found 49 shrink events, 43
  on rules that still stand, and they resolved to one genuine seam: #467. Six of this pack's rules
  had lost a clause carrying a failure mode, a cost or a frequency claim - something a review can
  weigh - and recovering it does not undo the owner's decision but completes it, since no reference
  file existed to hold it in July 2026. Every rule line stays exactly as #467 left it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a `references.md` beside the prose, each entry keyed from the rule it explains.
- **Landed:** #1575 (Closes #1571) · pack version 60901.1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers, where it was earned and
  where the release standard lived. It changes nothing a session does, every session in every
  declaring repo paid for it, and the README and the manifest's `ruleRoutingGuidance` already
  carried it. Across the corpus the sweep took non-rule prose from 2,900 words to 1,080.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-05 · moved · the prose file shrinks to the five always-on rules (#1667)
- **Reason:** every rule whose moment a file edit predicts left for one of the three skills, so what
  remains in `RULES.md` is what a session must know whether or not it opens a rules file or a
  function: the Admin-SDK bypass, token identity, boundary validation, pure decision modules and
  mirrored cross-language vectors.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** three path-forced skills beside a five-rule prose file.
- **Landed:** #1667 (Closes #1662) · pack version 60903.2.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

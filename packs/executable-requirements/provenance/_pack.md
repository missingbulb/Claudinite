## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** three worked implementations in the owner's fleet - GoogleCalendarEventCreator (the
  origin: extension/jsdom rendering, pixel-exact snapshots), TLDR (the cross-tier `server` kind) and
  ShoutsAndWhispers (the Flutter port: golden-file rendering, the fake-world harness and the first
  `saga` implementation).
- **Reason:** every new project, and every new stack inside one, re-derived the same mechanics for
  running a numbered spec as tests; carried as a pack they are adopted by convention instead. The
  judgment layer above them - doc-first discipline, owner-owned expecteds, honest-gap tracking - is
  a separate pack's, so this one is the mechanics only.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted on `dev/requirements/requirements.md` - the
  framework's one structural constant, since a repo running its spec as tests always has the spec
  file.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-07-29 · policy-changed · the pack asks its adoption interview (#401)
- **Reason:** adopting the pack without deciding how a UI requirement becomes an assertion, and
  where the requirements come from, defers the two choices that shape every requirement written
  afterwards.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** two questions on the manifest, `ui_testing` and `requirements_source`, asked when
  the pack is declared and enforced on the adding branch, where the owner is present; the second
  sets `config.spec`.
- **Landed:** #401 (Closes #400) · pack version 1.

## 2026-08-19 · reworded · the pack's prose stops naming its neighbours (#1060)
- **Reason:** boundary and turf prose is a second copy of what `ruleRoutingGuidance.excludes`
  already carries in one machine-read field, the field a lesson is routed by; the README and
  `RULES.md` now say what the pack does not cover without naming who does.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1060 (Closes #1057) · pack version 3.

## 2026-09-03 · reworded · `RULES.md` carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers and naming its three
  worked implementations. It changes nothing a session does, every session in every declaring repo
  paid for it, and the README and the manifest's `ruleRoutingGuidance` already carried it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-05 · reworded · the describe-only mechanism prose moves to the README (#1667)
- **Source:** the audit of every pack's `RULES.md` for rules that only matter while editing a
  nameable file class (#1662).
- **Reason:** the leaf-line regex, the coverage gate's inventory and the registry rule describe what
  the declaring project's own gates must do rather than instructing the session reading them, so
  every session in every declaring repo paid for prose it could not act on; the README carries them
  for the adopter.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.

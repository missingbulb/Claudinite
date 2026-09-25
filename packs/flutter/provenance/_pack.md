## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Reason:** the restructure gave every technology a declared home, and Flutter got one registered
  ahead of any captured practice - a prose-only stub whose `RULES.md` said so in as many words. The
  canon is distilled from worked examples rather than written from imagination, so the surface has a
  routing target from the start and the rules wait for a project to earn them.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by a `pubspec.yaml` at the repo root, not active
  by default.
- **Landed:** #128 (Closes #127, #131) · pack version 1.

## 2026-07-08 · promoted · the pack graduates from stub to earned practices (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firebase-backed, location-driven Flutter app with an
  executable-requirements UI suite. The evidence names the project for the set of rules rather than
  one per rule.
- **Reason:** one project had exercised Flutter far enough for the practices to read as portable, so
  the stub note went and the three groups it had been waiting for landed together: ports out of the
  widget tree, widget-test and golden mechanics, and toolchain habits. Registering android, ios,
  play-store-release and app-store-release as stubs in the same change put those surfaces on the
  lifecycle this pack had just finished.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Rejected:** keeping the enforceable pieces - the import scan and the coverage gates - in the
  pack. Neither can be judged from outside the consuming project, so both live there as committed
  tests and the pack states the duty instead.
- **Landed:** #165 (Closes #180) · pack version 1.

## 2026-07-08 · policy-changed · the fingerprint matches a marker one directory down (#185)
- **Source:** landing #165 in missingbulb/ShoutsAndWhispers, whose Flutter app sits in `app/`.
- **Reason:** fingerprinting a repo-root `pubspec.yaml` missed every monorepo, and the consumer had
  to declare the pack plus an accept-with-reason just to satisfy `pack-declaration`. One directory
  down and never deeper is the bound: a stray `pubspec.yaml` in a nested example or fixture tree
  must not trip detection. The android and ios packs already matched subdir markers, so this is the
  pack following them rather than a new idea.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `detect` on the pack manifest, matching `pubspec.yaml` at depth one or two.
- **Rejected:** leaving the consumer to declare the pack and accept the finding; an acceptance that
  exists only because detection is wrong hides the next real one.
- **Landed:** #185 (Closes #184) · pack version 1.

## 2026-07-10 · policy-changed · the pack declares the Flutter SDK a web session needs (#204)
- **Source:** missingbulb/ShoutsAndWhispers, whose hand-rolled setup script and check hook this
  generalizes; flutter was the first pack to declare one.
- **Reason:** the Claude Code Web base image ships no Flutter SDK, so a cloud session can run
  neither `flutter test` nor analyze nor a golden regeneration, and the fix belongs with the
  technology rather than copied into each consuming repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** an `env` block on the pack manifest - label, setup fragment and probe - aggregated
  into the generic setup script and asserted at SessionStart.
- **Rejected:** a per-session hook that installs on every start. The install belongs in the
  environment image, built once and snapshotted; and a per-repo setup script committed in each
  consumer, which is the duplication this replaced.
- **Landed:** #204 (Closes #208) · pack version 1.

## 2026-09-03 · reworded · Every pack's RULES.md carries rules, not a description of the pack (#1634)
- **Reason:** the file opened with a paragraph saying what the pack covers and where it was earned.
  It changes nothing a session does, every session in every declaring repo paid for it, and the
  README and the manifest's `ruleRoutingGuidance` already carried it. Across the corpus the sweep
  took non-rule prose from 2,900 words to 1,080.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-05 · moved · the web-sandbox SDK note leaves the prose file for the README (#1667)
- **Reason:** the note describes rather than instructs - what the environment lacks and how the
  pack's `env` block fills it is what an adopter wiring the pack needs, not what a session needs in
  context on every turn. The audit moved describe-only prose to the README across the packs it
  touched.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** the pack README's Environment section.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.

## 2026-09-05 · reaffirmed · the port-boundary design stays in the prose file (#1667)
- **Reason:** the audit named it as an extraction candidate and the owner's path bar refused it: no
  file edit predicts the moment the ports boundary is being decided, so a skill holding it would be
  reached by description alone or not at all.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1667 (Closes #1662) · pack version 60903.1.

## 2026-09-20 · policy-changed · the pack stops being prose-only and declares two checks (#2164)
- **Source:** the A rows of `docs/declarative-checks/rule-inventory.md` for a pack the sweep had
  never reached: ten prose rules and no checks.
- **Reason:** two of the rules are patterns over the shipped Dart tree and nothing else - a fetch
  the widget tree performs itself, and a time read off the device clock - so their whole logic fits
  a declaration beside the manifest. The rest of the pack was re-derived against the inventory and
  stays prose: the import boundary needs a project-supplied list of forbidden plugin prefixes, and
  the golden, analyze and test-runner rules are judgment no scan separates from healthy code.
- **Actor:** @missingbulb (owner), on the canon-prose-to-checks task.
- **Mechanism:** declared checks in the pack's `declared-checks.json`, both forbidden patterns so
  neither pins a call site in place.
- **Landed:** #2164 (work item #2142) · pack version 60920.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

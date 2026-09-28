## 2026-07-17 · born · Add product-wiki pack: the self-growing product research wiki standard (#301)
- **Source:** the standard missingbulb/GoogleCalendarEventCreator had just adopted (its #678) - the
  LLM-wiki pattern Karpathy described: compile findings once, refine in place, cite everything, keep
  a dated growth log.
- **Reason:** the standard is structural rather than configured. Two reserved names under the wiki
  root have fixed meaning and everything else under it is wiki space, so there is no wikis manifest
  to drift and a renamed or added wiki folder stays classified, checked and barred. The pack takes
  no config: the layout is the config.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted on the sink's README - the standard's one
  structural constant.
- **Rejected:** a runner-level manifest seam for "this pack accepts no config", left until a second
  pack needs it, so the guard rode the layout rule's id instead.
- **Landed:** #301 (Refs #302) · pack version 1.

## 2026-09-04 · reworded · Absorb barriers into basics, and stop it interviewing on adoption (#1684)
- **Reason:** the declared requirement on the barriers pack was vestigial once the isolation wall
  became a declared check the engine runs; a declared check needs nothing else declared beside it
  for the wall to stand.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1684 (Closes #1681) · pack version 60904.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-09-27 · born · a pitch paragraph for the dashboard's plain-repo view
- **Reason:** the dashboard shows a repo that does not run Claudinite the packs that fit it, and the
  owner asked for one paragraph per pack naming its main skills and process gains, with rough counts
  so it outlives the pack's growth.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `pitch` field, beside `ruleRoutingGuidance`.

## 2026-09-27 · scope-changed · the fingerprint is a `relevanceDetector` spec, not a function
- **Reason:** the owner asked for fingerprints a reader holding only GitHub's API can judge cheaply
  - a tree listing, a code search, then only the files that search names - which a function over a
  synchronous `read` cannot offer.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `relevanceDetector` (engine/pack_loader/relevance-detector.mjs): `paths`, optional `text`,
  `search` terms; it answers exactly what the retired `detect` answered, proven over 4,000 composed
  repos before the change.

## 2026-09-28 · reworded · the manifest spells out the value it imported
- **Reason:** a manifest that is data cannot import; the value is written out, and the pack's test
  holds it equal to the module it came from.
- **Actor:** @missingbulb (owner), asking for pack.json manifests with imported values inlined and a
  check against drift.

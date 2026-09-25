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

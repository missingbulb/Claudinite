## 2026-07-06 · born · Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128)
- **Source:** the restructure's per-rule conversion inventory, which audited the whole corpus and
  gave each technology's gotchas a pack of its own.
- **Reason:** the pack opened prose-only, its two jsdom divergences being runtime knowledge with no
  artifact signature a check could read.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a pack fingerprinted on a repo-root `package.json`, its prose injected at
  SessionStart in any repo that declares it.
- **Landed:** #128 (Closes #127, #131) · pack version 1.

## 2026-07-08 · reworded · the fingerprint matches a marker one directory down (#185)
- **Source:** landing #165 in the ShoutsAndWhispers consumer, a monorepo keeping its Node functions
  in `functions/`: detection failed there and the repo had to declare the pack plus an
  accept-with-reason just to satisfy `pack-declaration`.
- **Reason:** the root or one directory down covers a monorepo's `functions/` or `server/` dir, as
  the android and ios packs already did; never deeper, so a `package.json` in a nested example or
  fixture tree cannot trip detection.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #185 (Closes #184) · pack version 1.

## 2026-07-10 · reworded · the pack declares what a web session's environment needs (#204)
- **Source:** the pack-driven cloud environment model, which moved install logic out of per-repo
  setup scripts and onto the pack that owns the technology.
- **Reason:** the Node runtime ships in the base image but a repo's modules do not, so a test or
  build would trigger a confusing mid-session install; the pack installs them at environment-image
  build instead. Where `package.json` lives varies per repo, so the directories are a per-project
  param the member supplies rather than a value the pack could pick, and the probe asserts the
  requirement directly, `node_modules` being present, rather than trusting a recorded version.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Landed:** #204 (Closes #208) · pack version 1.

## 2026-09-03 · reworded · RULES.md carries rules, not a description of the pack (#1634)
- **Source:** the audit #1625 gave one pack, run across the other 25.
- **Reason:** the opening paragraph and the jsdom section's "Two that recur" changed nothing a
  session does while every session in every declaring repo paid for them, and the README plus the
  manifest's `ruleRoutingGuidance` already carry what they said, checked here before dropping.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1634 (Closes #1632) · pack version 60902.1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

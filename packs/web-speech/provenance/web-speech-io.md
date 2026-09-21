## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** the web-speech-io skill at `skills/web-speech-io/`, routed by its frontmatter
  description, holding the two checks whose gotchas have a file-scoped signature.
- **Landed:** #346 (Refs #303) · pack version 1.

## 2026-07-21 · moved · Vendored-mount surface shrink: skills into packs (#384)
- **Reason:** ownership is placement. Every skill already had exactly one declaring pack, so the
  manifest's `skills` key and the `skill-ownership` check were a second copy of where the skill sat.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the skill moves from `skills/web-speech-io/` to
  `packs/web-speech/skills/web-speech-io/`; its bundled checks now ride the pack's activation.
- **Landed:** #384 (Fixes #383, Refs #385) · pack version 1.

## 2026-08-20 · reworded · Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060)
- **Reason:** a pack does not discuss its neighbours - boundary prose naming another pack is a
  second copy of what `ruleRoutingGuidance.excludes` already carries in one machine-read field. The
  opening now states what is out of scope without naming who owns it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1060 (Closes #1057) · pack version 3.

## 2026-09-03 · reworded · A skill opens on what to do, not on what the skill is (#1647)
- **Reason:** the opening pointed at prose the reader already holds - a mounted skill means a
  declared pack, so a sentence sending the reader to this pack's own RULES.md sends nobody anywhere.
- **Actor:** @missingbulb (owner).
- **Landed:** #1647 (Closes #1646) · pack version 60903.1.

## 2026-07-19 · born · web-speech pack: browser voice I/O - 2 skill-owned checks + runtime-gotcha prose (#346)
- **Source:** missingbulb/CrosswordChat, a Chrome extension that solves the NYT crossword
  conversationally: its `extension/src/speech/` ports, the service-worker TTS relay, and its
  `dev/docs/FEASIBILITY.md` speech-API analysis.
- **Reason:** browser voice I/O is a facet of its own - the runtime behaviour of the recognition and
  synthesis APIs - and one project had accumulated enough of it to be portable.
- **Actor:** @missingbulb (owner).
- **Model:** claude, per the commit trailer.
- **Mechanism:** the pack manifest, fingerprinted by a browser speech-API reference in JS/TS source.
  The marker only suspects the pack; declaring it stays the project's call, as for every pack.
- **Rejected:** making the pack checks-only. Of the seventeen gotchas only two had a file-scoped
  signature; the rest are runtime and behavioural, with no repo state a static check could read, so
  the pack is mostly prose by design rather than by omission.
- **Landed:** #346 (Refs #303) · pack version 1.

## 2026-09-25 · scope-changed · `minEngineVersion` rises to 60925.1
- **Reason:** this pack's checks declare `on_fail`, which an older engine does not read; the pack
  update holds this version until the member's engine is at 60925.1.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the manifest's `minEngineVersion`, which the pack update enforces.

## 2026-08-12 · born · an AppKit app with a capture tap must route the terminating signals (#756)
- **Source:** missingbulb/LaughCounter, a SwiftPM menu-bar agent app published as a notarized DMG
  through GitHub Actions: its `mac/scripts/`, `mac/Resources/`, release workflow and
  `dev/procedures/mac-audio-lifecycle.md`.
- **Reason:** the rule is itself conditional, so the gate is false-positive-free: the check fires
  only on an AppKit app that installs a capture tap, three arms covering nothing routed, a signal
  named nowhere, and `SIG_IGN` ordered after `resume()`. `sigaction` and a direct `signal(SIGTERM,
  ...)` both count as routing; a command-line tool and a tapless app are out of scope by the gate.
  The prose bullet beside it was kept rather than deleted, since it also carries the residual risk
  and the NSException exit path.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a coded check, `packs/macos/signal-teardown-routing.mjs`, blocking, scanning
  `*.swift` anywhere with comments stripped rather than assuming a `mac/` layout.
- **Landed:** #756 (Closes #641) · pack version 1.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268

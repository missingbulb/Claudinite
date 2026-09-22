## 2026-08-12 · born · the rules distilled from a shipping Mac app (#756)
- **Source:** missingbulb/LaughCounter's `on-device-privacy` local pack, its `on-device-speech`
  check; `requiresOnDeviceRecognition` is a property of the request, so a call site added later
  starts out server-side.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "SFSpeechRecognizer streams audio to Apple's servers
  by default.".
- **Landed:** #756 (Closes #641) · pack version 1.

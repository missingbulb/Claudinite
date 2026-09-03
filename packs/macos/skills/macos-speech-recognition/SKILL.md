---
name: macos-speech-recognition
description: Using SFSpeechRecognizer without audio leaving the machine — the per-request on-device opt-in, the locale-model support check, and the TCC-only gate it sits behind. Use when adding or changing any SFSpeech* call site.
---

# Speech recognition leaves the machine unless you say it must not

- **`SFSpeechRecognizer` streams audio to Apple's servers by default.** On-device recognition is
  opt-in, and the opt-in is a property of the **request**
  (`request.requiresOnDeviceRecognition = true`), not of the recognizer — so it has to be set on
  every request the app builds, and a new call site added later starts out server-side. Nothing in
  the build says which mode ran; the difference is only visible in what left the machine.

- **The opt-in is only honourable where the locale's model is installed.** `supportsOnDeviceRecognition`
  is per-recognizer and false until then, and requiring on-device recognition where it isn't
  supported fails the request rather than quietly falling back — so check it and decide the degrade
  deliberately (refuse the feature, or say plainly that this locale would transcribe off-device).

- Speech is TCC-gated, so it needs its usage string and **no** entitlement — see
  [macos-entitlements-and-tcc](../macos-entitlements-and-tcc/SKILL.md).

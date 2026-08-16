# web-speech pack

Active when a browser speech API — `webkitSpeechRecognition` / `SpeechRecognition`, `speechSynthesis` / `SpeechSynthesisUtterance`, or `chrome.tts` — is referenced in JS/TS source. Portable runtime gotchas for browser voice I/O (speech-to-text and text-to-speech).

Most gotchas are runtime browser behaviours with no repo-state signature a static check could read, so they live as prose (`RULES.md`). The two that **do** have a file-scoped signature are the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's check-the-work rules, which run at every Stop and in CI — each failure message is the rule.

Where a rule touches MV3 service-worker / content-script mechanics that also bear on non-speech APIs, the general extension gotchas live in the [`chrome-extension`](../chrome-extension/README.md) pack; this pack owns the speech-API facets specifically.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The recognizer owns its own microphone capture — you cannot hand it getUserMedia audio constraints. | high | correctness | prose: 99 words + skill check (`web-speech-capture-released-on-pagehide`) |
| Read the whole n-best list, not just alternative [0]. | medium | correctness | prose: 33 words |
| onresult, onend, and onerror all fire — settle the cycle exactly once. | high | correctness | prose: 46 words |
| With interimResults off, engines omit isFinal — treat a result as final unless isFinal === false. | high | correctness | prose: 35 words |
| The classic recognizer streams audio to a cloud service (Google's) — plan for it. | critical | legal | prose: 74 words |
| Contextual biasing (SpeechRecognitionPhrase + recognizer.phrases) works only on the on-device path | medium | correctness | prose: 71 words |
| Map the raw Web Speech error names to a small taxonomy | medium | complexity | prose: 48 words |
| A missed endpoint mid-utterance needs a pause watchdog, not just onend. | high | correctness | prose: 82 words |
| Mic permission is per-origin, and the grant belongs to whatever page the recognizer runs in. | high | correctness | prose: 93 words |
| Prefer chrome.tts over speechSynthesis — it's immune to page autoplay / user-activation gating. | medium | correctness | prose: 58 words |
| chrome.tts doesn't exist in a content script — relay speak/cancel to the service worker over a port. | high | correctness | prose: 66 words + skill check (`web-speech-no-window-api-in-service-worker`) |
| Voice lists load lazily — an empty getVoices() means "not ready yet", not "no voices". | high | correctness | prose: 44 words |
| Don't trust the OS/browser default voice — it's often the most robotic one installed. | low | correctness | prose: 39 words |
| Resolve a speak() promise on any terminal event, and never reject. | high | correctness | prose: 60 words |
| Neither engine reliably supports SSML — you can't force intonation. | low | correctness | prose: 37 words |

## Provenance

Distilled from `missingbulb/CrosswordChat` — a Chrome extension that solves the NYT crossword conversationally (voice in, voice out). Grounded in its `extension/src/speech/` ports (`stt-port.js`, `tts-port.js`, `remote-tts-port.js`, `biasing.js`), the service-worker TTS relay (`extension/src/background/service-worker.js`), and its `dev/docs/FEASIBILITY.md` speech-API analysis.

## Checks

All three ride the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's bundle.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `web-speech-no-window-api-in-service-worker` | high | correctness | check: blocking |
| `web-speech-capture-released-on-pagehide` | critical | correctness | check: blocking |
| `web-speech-recognition-feature-detected` | medium | correctness | check: advisory |

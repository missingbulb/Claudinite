# web-speech pack

Active when a browser speech API — `webkitSpeechRecognition` / `SpeechRecognition`, `speechSynthesis` / `SpeechSynthesisUtterance`, or `chrome.tts` — is referenced in JS/TS source. Portable runtime gotchas for browser voice I/O (speech-to-text and text-to-speech).

Most gotchas are runtime browser behaviours with no repo-state signature a static check could read, so they live as prose (`RULES.md`). The two that **do** have a file-scoped signature are the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's check-the-work rules, which run at every Stop and in CI — each failure message is the rule.

Where a rule touches MV3 service-worker / content-script mechanics that also bear on non-speech APIs, the general extension gotchas live in the [`chrome-extension`](../chrome-extension/README.md) pack; this pack owns the speech-API facets specifically.

## Rules (`RULES.md`)

| Rule | Words | Severity | Reason | How enforced |
|---|---|---|---|---|
| The recognizer owns its own microphone capture — you cannot hand it getUserMedia audio constraints. | 99 | high | correctness | prose + skill check (`web-speech-capture-released-on-pagehide`) |
| Read the whole n-best list, not just alternative [0]. | 33 | medium | correctness | prose |
| onresult, onend, and onerror all fire — settle the cycle exactly once. | 46 | high | correctness | prose |
| With interimResults off, engines omit isFinal — treat a result as final unless isFinal === false. | 35 | high | correctness | prose |
| The classic recognizer streams audio to a cloud service (Google's) — plan for it. | 74 | critical | legal | prose |
| Contextual biasing (SpeechRecognitionPhrase + recognizer.phrases) works only on the on-device path | 71 | medium | correctness | prose |
| Map the raw Web Speech error names to a small taxonomy | 48 | medium | complexity | prose |
| A missed endpoint mid-utterance needs a pause watchdog, not just onend. | 82 | high | correctness | prose |
| Mic permission is per-origin, and the grant belongs to whatever page the recognizer runs in. | 93 | high | correctness | prose |
| Prefer chrome.tts over speechSynthesis — it's immune to page autoplay / user-activation gating. | 58 | medium | correctness | prose |
| chrome.tts doesn't exist in a content script — relay speak/cancel to the service worker over a port. | 66 | high | correctness | prose + skill check (`web-speech-no-window-api-in-service-worker`) |
| Voice lists load lazily — an empty getVoices() means "not ready yet", not "no voices". | 44 | high | correctness | prose |
| Don't trust the OS/browser default voice — it's often the most robotic one installed. | 39 | low | correctness | prose |
| Resolve a speak() promise on any terminal event, and never reject. | 60 | high | correctness | prose |
| Neither engine reliably supports SSML — you can't force intonation. | 37 | low | correctness | prose |

## Provenance

Distilled from `missingbulb/CrosswordChat` — a Chrome extension that solves the NYT crossword conversationally (voice in, voice out). Grounded in its `extension/src/speech/` ports (`stt-port.js`, `tts-port.js`, `remote-tts-port.js`, `biasing.js`), the service-worker TTS relay (`extension/src/background/service-worker.js`), and its `dev/docs/FEASIBILITY.md` speech-API analysis.

## Checks

All three ride the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's bundle.

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `web-speech-no-window-api-in-service-worker` | blocking | high | correctness | no `window`-only speech API is referenced from an MV3 service worker, where it does not exist |
| `web-speech-capture-released-on-pagehide` | blocking | critical | correctness | a page releases its mic capture on `pagehide` — the bfcache suspends rather than destroys, so the microphone otherwise stays on |
| `web-speech-recognition-feature-detected` | advisory | medium | correctness | a recognizer is feature-detected rather than constructed under the bare webkit prefix |

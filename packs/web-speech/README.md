# web-speech pack

Active when a browser speech API — `webkitSpeechRecognition` / `SpeechRecognition`, `speechSynthesis` / `SpeechSynthesisUtterance`, or `chrome.tts` — is referenced in JS/TS source. Portable runtime gotchas for browser voice I/O (speech-to-text and text-to-speech). Prose only (`RULES.md`), no checks — these are runtime browser behaviours, not repo-state signatures a static check could test.

Where a rule touches MV3 service-worker / content-script mechanics, the general extension gotchas live in the [`chrome-extension`](../chrome-extension/README.md) pack; this pack owns the speech-API facets specifically.

## Prose gotchas (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Feature-detect webkit-prefixed recognizer | prose |
| No recognition in service worker | prose |
| Recognizer owns its mic capture | prose |
| Read the n-best list | prose |
| Settle the listen cycle once | prose |
| Missing isFinal means final | prose |
| Classic recognition is cloud/online | prose |
| Biasing only on-device, modest | prose |
| Map speech errors to taxonomy | prose |
| Pause watchdog for missed endpoints | prose |
| Mic permission is per-origin | prose |
| Prefer chrome.tts over speechSynthesis | prose |
| Relay chrome.tts from content script | prose |
| Empty getVoices means not-ready | prose |
| Don't trust the default voice | prose |
| Resolve speak on any terminal event | prose |
| No SSML — speak the cue | prose |

## Provenance

Distilled from `missingbulb/CrosswordChat` — a Chrome extension that solves the NYT crossword conversationally (voice in, voice out). Grounded in its `extension/src/speech/` ports (`stt-port.js`, `tts-port.js`, `remote-tts-port.js`, `biasing.js`), the service-worker TTS relay (`extension/src/background/service-worker.js`), and its `dev/docs/FEASIBILITY.md` speech-API analysis.

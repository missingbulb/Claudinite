# web-speech pack

Active when a browser speech API — `webkitSpeechRecognition` / `SpeechRecognition`, `speechSynthesis` / `SpeechSynthesisUtterance`, or `chrome.tts` — is referenced in JS/TS source. Portable runtime gotchas for browser voice I/O (speech-to-text and text-to-speech).

Most gotchas are runtime browser behaviours with no repo-state signature a static check could read, so they live as prose (`RULES.md`). The two that **do** have a file-scoped signature are the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's check-the-work rules, which run at every Stop and in CI — each failure message is the rule.

Where a rule touches MV3 service-worker / content-script mechanics that also bear on non-speech APIs, the general extension gotchas live in the [`chrome-extension`](../chrome-extension/README.md) pack; this pack owns the speech-API facets specifically.

## Checks (`web-speech-io` skill)

| Rule (≤5 words) | Severity | How enforced |
|---|---|---|
| No window speech API in worker | blocking | skill check `web-speech-no-window-api-in-service-worker` |
| Feature-detect the recognizer | advisory | skill check `web-speech-recognition-feature-detected` |

## Prose gotchas (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
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

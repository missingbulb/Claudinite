# web-speech pack

Active when a browser speech API — `webkitSpeechRecognition` / `SpeechRecognition`, `speechSynthesis` / `SpeechSynthesisUtterance`, or `chrome.tts` — is referenced in JS/TS source. Portable runtime gotchas for browser voice I/O (speech-to-text and text-to-speech).

Most gotchas are runtime browser behaviours with no repo-state signature a static check could read, so they live as prose (`RULES.md`). The two that **do** have a file-scoped signature are the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's check-the-work rules, which run at every Stop and in CI — each failure message is the rule.

Some of these APIs are extension-only, and where a rule touches MV3 service-worker or content-script mechanics this pack owns the speech-API facet of it specifically — never the general extension gotcha underneath.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The recognizer owns its microphone capture | high | correctness | prose: 99 words + skill check (`web-speech-capture-released-on-pagehide`) |
| Read the whole n-best list | medium | correctness | prose: 34 words |
| Settle the listen cycle exactly once | high | correctness | prose: 47 words |
| A missing isFinal means final | high | correctness | prose: 35 words |
| Map error names to a small taxonomy | medium | complexity | prose: 48 words |
| A missed endpoint needs a pause watchdog | high | correctness | prose: 82 words |
| Prefer chrome.tts over speechSynthesis | medium | correctness | prose: 58 words |
| An empty getVoices() means not-ready | high | correctness | prose: 44 words |
| Don't trust the default voice | low | correctness | prose: 39 words |
| Resolve speak() on any terminal event | high | correctness | prose: 60 words |
| Neither engine reliably supports SSML | low | correctness | prose: 37 words |

The cloud-streaming / on-device probe, contextual biasing, mic-permission preflight and content-script
TTS relay rules are the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's, loaded when recognition
or synthesis is being wired.

## Skills

| Skill | Trigger |
|---|---|
| [`web-speech-io`](skills/web-speech-io/SKILL.md) | adding or changing speech recognition or synthesis |

## Provenance

Distilled from `missingbulb/CrosswordChat` — a Chrome extension that solves the NYT crossword conversationally (voice in, voice out). Grounded in its `extension/src/speech/` ports (`stt-port.js`, `tts-port.js`, `remote-tts-port.js`, `biasing.js`), the service-worker TTS relay (`extension/src/background/service-worker.js`), and its `dev/docs/FEASIBILITY.md` speech-API analysis.

## Checks

All three ride the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's bundle.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `web-speech-no-window-api-in-service-worker` | high | correctness | check: blocking |
| `web-speech-capture-released-on-pagehide` | critical | correctness | check: blocking |
| `web-speech-recognition-feature-detected` | medium | correctness | check: advisory |

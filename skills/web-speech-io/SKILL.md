---
name: web-speech-io
description: Wiring browser voice I/O — speech-to-text (webkitSpeechRecognition / the Web Speech SpeechRecognition API) and text-to-speech (chrome.tts / speechSynthesis). Use when adding or changing recognition or synthesis.
---

# Web-speech I/O

Wire recognition and synthesis to the project's own shape. The portable runtime gotchas — n-best reading, settle-once cycles, error taxonomy, pause watchdogs, lazy voice lists, terminal-event resolution — live in the [`web-speech`](../../packs/web-speech/RULES.md) pack's prose. MV3 service-worker / content-script mechanics that also touch non-speech APIs are the [`chrome-extension`](../../packs/chrome-extension/README.md) pack's turf.

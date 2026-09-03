---
name: web-speech-io
description: Wiring browser voice I/O — speech-to-text (webkitSpeechRecognition / the Web Speech SpeechRecognition API) and text-to-speech (chrome.tts / speechSynthesis). Use when adding or changing recognition or synthesis.
---

# Web-speech I/O

Wire recognition and synthesis to the project's own shape. MV3 service-worker and content-script mechanics that also touch non-speech APIs are out of scope.

## Speech-to-text

- **The classic recognizer streams audio to a cloud service (Google's) — plan for
  it.** A `network` error means "offline / service unreachable", and audio leaves
  the machine. On-device recognition is opt-in and capability-gated: probe
  `SpeechRecognition.available({ langs, processLocally: true }) === 'available'`
  once and cache it, set `recognizer.processLocally = true`, and **never trigger a
  language-pack download** (only `'available'` counts, not `'downloadable'`). When
  the local path is absent, fall back to ordinary cloud recognition unchanged.

- **Contextual biasing (`SpeechRecognitionPhrase` + `recognizer.phrases`) works
  only on the on-device path** — gate it behind that same availability probe and
  apply it best-effort (any failure falls back to un-biased recognition rather than
  breaking the listen cycle). Only bias **closed vocabularies you control**
  (a command lexicon, known labels, a spelling alphabet) with **modest** boosts:
  over-boosting makes the recognizer hear a biased phrase when the user actually
  said a same-sounding free-form utterance.

- **Mic permission is per-origin, and the grant belongs to whatever page the
  recognizer runs in.** In a content script the prompt reads as the *host site*
  asking and the grant persists for that origin. Surface it in a controlled moment:
  preflight `navigator.permissions.query({ name: 'microphone' })`, then a one-time
  `getUserMedia` to raise the prompt. **Retry the capture bare** (`{ audio: true }`)
  if the first constrained call is rejected — a browser balking at the constraint
  *shape* must not be misread as a permission denial; only a second failure is a
  real "denied".

## Text-to-speech

- **`chrome.tts` doesn't exist in a content script — relay speak/cancel to the
  service worker over a port.** Keep the same `speak()`/`cancel()` contract on both
  sides; the in-page port sends `{ speak }` / `{ cancel }` messages and the worker
  drives `chrome.tts`. On port disconnect, resolve every pending `speak()` promise
  so a dead worker never leaves the caller awaiting an utterance that will never
  finish.

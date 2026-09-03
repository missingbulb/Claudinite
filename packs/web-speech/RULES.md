# Web Speech APIs

> Some of these APIs (`chrome.tts`) are extension-only; where a rule touches
> MV3 service-worker / content-script mechanics, only the speech-API facet is
> here — the general extension gotcha underneath is not.

## Speech-to-text (`webkitSpeechRecognition` / Web Speech API)

- **The recognizer owns its own microphone capture — you cannot hand it
  `getUserMedia` audio constraints.** `echoCancellation` / `noiseSuppression` /
  `autoGainControl` are `getUserMedia` *microphone* constraints, and the recognizer
  exposes no hook to set them on its internal stream (Chrome applies its default
  echo cancellation there regardless). To *warm* the device with a known processing
  state — and to read back whether echo cancellation actually engaged — run a
  separate preflight `getUserMedia({ audio: {…} })` capture and stop its tracks.
  (`suppressLocalAudioPlayback` /
  `restrictOwnAudio` are `getDisplayMedia` *screen-capture* constraints and have no
  bearing on a mic — don't reach for them here.)
- **Read the whole n-best list, not just alternative `[0]`.** Set
  `maxAlternatives` > 1 and iterate `result[0..length]` for `{ transcript,
  confidence }`; the ranked alternatives are exactly where homophone / near-miss
  recovery lives. (1)
- **`onresult`, `onend`, and `onerror` all fire — settle the cycle exactly once.**
  Guard a `settled` flag: interim results arrive before the final one, a cycle can
  end with no result at all (treat `onend`-without-result as `no-speech`), and an
  error and an end can both arrive. (2)
- **With `interimResults` off, engines omit `isFinal` — treat a result as final
  unless `isFinal === false`.** Don't test `if (result.isFinal)` (it's `undefined`
  on those engines and you'll drop every result); test `result.isFinal !== false`.
- **Map the raw Web Speech error names to a small taxonomy** — `not-allowed` /
  `service-not-allowed` → permission-denied, plus `no-speech`, `network`,
  `aborted`, `audio-capture`, else `other`. In particular `aborted` is the
  *self-inflicted* stop (you called `recognizer.abort()`), so the caller should
  ignore it rather than surface it as a failure.
- **A missed endpoint mid-utterance needs a pause watchdog, not just `onend`.**
  If interim hypotheses exist but no final arrives, the engine may have lost the
  endpoint; a timer that fires after a pause discards the half-heard input and
  reopens a fresh cycle (preventing "heart heart" doubles when the user repeats
  themselves). Set the threshold **well above a natural mid-command thinking
  pause** — a tight window (~1.2 s) cuts real commands; a wider one (~1.8 s) keeps
  only the genuine missed-endpoint case.

## Text-to-speech (`chrome.tts` / `speechSynthesis`)

- **Prefer `chrome.tts` over `speechSynthesis` — it's immune to page
  autoplay / user-activation gating.** `speechSynthesis` invoked from a content
  script is subject to the host page's autoplay policy and can silently refuse to
  speak; `chrome.tts` (extension-only, needs the `"tts"` permission, usable from the
  service worker) is not. Make `chrome.tts` primary and `speechSynthesis` the
  fallback for non-extension document contexts.
- **Voice lists load lazily — an empty `getVoices()` means "not ready yet", not
  "no voices".** Resolve the preferred voice on the *first* `speak()` and don't
  cache an empty result: fall back to the default that turn and try to resolve
  again next turn.
- **Don't trust the OS/browser default voice — it's often the most robotic one
  installed.** Keep an ordered list of preferred voice names, take the first one
  actually installed, and fall back to the default only when none match.
- **Resolve a `speak()` promise on *any* terminal event, and never reject.** For
  `chrome.tts` that's `end` / `interrupted` / `cancelled` / `error`; for
  `speechSynthesis` it's `onend` / `onerror`. Resolving (not rejecting) on error
  keeps a spoken-prompt sequence from deadlocking on one bad utterance. Use
  `enqueue: false` so a new line interrupts the current one for turn-taking rather
  than stacking up.
- **Neither engine reliably supports SSML — you can't force intonation.** If a
  punctuation cue matters (a question's rising tone), speak the cue in words
  ("question mark") rather than relying on prosody the engine may not apply.

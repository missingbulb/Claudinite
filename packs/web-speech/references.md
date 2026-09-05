# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** The ranked alternatives are exactly where homophone and near-miss recovery
  lives, so taking only alternative `[0]` throws away the recognizer's own best correction
  material. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose
  arguing for a rule rather than enabling it”, before this pack had a references.md to hold
  it). Reaffirm while `maxAlternatives` is supported; retire if engines stop returning a useful
  n-best list.
- **(RULES-2)** The settle-once guard exists because the first terminal signal wins and later
  ones are ignored: interim results arrive before the final one, a cycle can end with no result
  at all, and an error and an end can both arrive — so without the flag the cycle resolves more
  than once. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose
  arguing for a rule rather than enabling it”, before this pack had a references.md to hold
  it). Reaffirm while all three handlers can fire for one cycle; retire if the API guarantees a
  single terminal event.
- **(RULES-3)** Chrome's automatic echo cancellation on the recognizer's own capture is a
  loopback of the *page's* playout, so it attenuates `speechSynthesis` but never sees
  `chrome.tts`, whose audio the OS renders outside the page. That leaves a residual echo no
  capture-layer constraint can reach — which is why the string-match guard against what was
  just spoken is the design rather than a workaround, and why reaching for a constraint
  instead means the guard never gets written. Reaffirm while `chrome.tts` renders outside the
  page's audio graph; retire if the recognizer gains a constraint hook or AEC starts covering
  OS-rendered output.
- **(RULES-4)** The preferred-voice order and the speaking rate were both set once as
  constants in CrosswordChat and both turned out wrong for real users — the failure mode of a
  taste judgment frozen into source. Reaffirm while voice availability and preference remain
  per-machine and per-person; retire if engines converge on a voice good enough that a
  default needs no escape hatch.
- **(check:mic-capture-released)** A `getUserMedia` stream is freed only by stopping its
  tracks: dropping the reference, closing an `AudioContext` or unsetting a `srcObject` frees
  nothing, and both the browser's recording indicator and the OS microphone indicator stay
  lit. On a voice app that is the most alarming possible bug — it looks to the user like the
  app is still listening. File-scoped rather than flow-scoped on purpose: proving a
  particular stream is stopped needs real data-flow analysis, and a check that guesses is
  worse than one asking an honest question. Reaffirm while track-stopping is the only
  release; retire if streams gain deterministic collection.
- **(check:mic-constraints-not-screen-capture)** `suppressLocalAudioPlayback` and
  `restrictOwnAudio` are `getDisplayMedia` screen-capture constraints; `getUserMedia` ignores
  them with no throw, no warning and no `OverconstrainedError`. They are reached for by name
  by someone hunting their app's own TTS leaking back through the mic, so the cost is not the
  dead property but the application-level echo guard (RULES-3) that never gets written.
  Reaffirm while the constraint names remain `getDisplayMedia`-only; retire if `getUserMedia`
  ever honours them.
- **(check:stt-error-map-has-default)** The Web Speech error-name set is open: it is a spec
  enum today, but Chrome has shipped names outside the original list and a vendor-prefixed
  engine can invent one at any release. A mapping switch with no `default:` arm returns
  `undefined` for such a name, every downstream comparison on the kind is then false, and the
  dialog policy silently takes its do-nothing arm. Reaffirm while the error vocabulary can
  grow; retire if the set is closed and versioned.
- **(check:stt-interim-results-gated)** Interim hypotheses arrive on the same `result` event
  as the finished utterance, so enabling `interimResults` does not open a second channel —
  only `isFinal` distinguishes a guess from a transcript. A handler that delivers without
  gating hands the caller a half-heard fragment, then the next, several times per utterance:
  the `"heart heart"` shape. Reaffirm while interim and final share one event; retire if the
  API separates them.
- **(check:stt-terminal-handlers)** A recognition cycle has three exits and only one is
  `result`: `end` fires when the recognizer closes with nothing (a silent user, an endpoint
  the engine gave up on, an OS-level device grab) and `error` on the named failures, of which
  `aborted` arrives on every `stop()` and every barge-in. A recognizer wired for `result`
  alone leaves its cycle pending on two of its three exits, with the UI still showing a live
  mic. Reaffirm while all three events can terminate a cycle; retire if the API guarantees a
  single terminal event.
- **(check:tts-speak-settles)** Both engines end an utterance in more ways than "it
  finished": `chrome.tts` reports `interrupted` whenever a later `speak()` with
  `enqueue: false` displaces it and `cancelled` when it is dropped before starting, and
  `speechSynthesis` reports a failed utterance through `error` and never through `end`. In
  any app that can speak twice or stop early those are the common path, not edge cases, so a
  handler resolving on `end` alone leaves the awaiting caller pending forever with nothing
  thrown and nothing logged. Reaffirm while the terminal-event sets stand; retire if either
  engine collapses them into one.

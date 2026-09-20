## 2026-09-05 · born · converted from references.md (check:tts-speak-settles)
- **Reason:** Both engines end an utterance in more ways than "it finished": `chrome.tts` reports
  `interrupted` whenever a later `speak()` with `enqueue: false` displaces it and `cancelled` when
  it is dropped before starting, and `speechSynthesis` reports a failed utterance through `error`
  and never through `end`. In any app that can speak twice or stop early those are the common path,
  not edge cases, so a handler resolving on `end` alone leaves the awaiting caller pending forever
  with nothing thrown and nothing logged.
- **Mechanism:** a check
- **Retire when:** Reaffirm while the terminal-event sets stand; retire if either engine collapses
  them into one.

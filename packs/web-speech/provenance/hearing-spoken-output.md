## 2026-09-05 · born · converted from references.md (RULES-3)
- **Reason:** Chrome's automatic echo cancellation on the recognizer's own capture is a loopback of
  the *page's* playout, so it attenuates `speechSynthesis` but never sees `chrome.tts`, whose audio
  the OS renders outside the page. That leaves a residual echo no capture-layer constraint can reach
  — which is why the string-match guard against what was just spoken is the design rather than a
  workaround, and why reaching for a constraint instead means the guard never gets written.
- **Mechanism:** prose
- **Retire when:** Reaffirm while `chrome.tts` renders outside the page's audio graph; retire if the
  recognizer gains a constraint hook or AEC starts covering OS-rendered output.

---
covers:
  - check: declarative-content-set-icon
status: live
---

## 2026-07-03 · born · promoted as prose from a member's local docs (c90f0c51)
- **Source:** GoogleCalendarEventCreator's local docs: the action icon stayed unset when `SetIcon` was built with `path`, with no throw and no console error.
- **Reason:** `declarativeContent` rules are evaluated by the browser process, so the icon must already be raw pixels at registration time; `imageData` is what survives, decoded from the packaged icon in the worker.
- **Actor:** automation `growth-promote` (phase 2 of the growth lifecycle), merged by the owner.
- **Model:** unrecovered.
- **Mechanism:** prose; checks did not exist yet.
- **Rejected:** none recorded.
- **Retire when:** Chrome makes `path` work there, or fail loudly.
- **Evidence:** commit c90f0c51 (the pre-pack corpus file).

## 2026-07-26 · converted · becomes the blocking coded check, and the prose is deleted (#462)
- **Reason:** the failure is silent, so nothing else catches it, and the call has a static signature. Parsed, not grepped: the `declarativeContent.` qualifier is required so `chrome.action.setIcon({path})` — the correct use of the differently-cased API — stays quiet, and only the argument's own depth-1 keys are read; comments stripped first. The deletion test found the prose fully carried by the finding's why and fix, so the prose went.
- **Actor:** owner, consolidating six pending pull requests into one.
- **Model:** trailer: Claude.
- **Rejected:** a grep for `path:` (drowns in false alarms); `SetIcon` alone (ambiguous with the action API).
- **Evidence:** #462 (Refs #435; conversion from #447); two violating fixtures red when the key lookup is neutered, four false-positive guards green.

## 2026-08-12 · reworded · the check's `doc` pointer moves from `RULES.md` to the pack README (#780)
- **Reason:** the README's hand-kept index had drifted into claiming a prose rule "SetIcon needs imageData — prose + check" that was never committed, and the pointer sent a reader following a finding to a file that never explained it; the README now states the rule is carried by the check alone.
- **Actor:** owner.
- **Evidence:** #780 (Closes #777).

## 2026-09-01 · reaffirmed · the retire test is written down for the revalidation pass (#1565)
- **Retire when:** re-test `path` on a current Chrome; retire only if Chrome makes `path` work, or fail loudly.
- **Actor:** owner.
- **Evidence:** #1565 (Refs #1564); VERSIONS.md 60901.1.

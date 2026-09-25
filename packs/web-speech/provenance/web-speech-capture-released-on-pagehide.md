## 2026-07-19 · born · web-speech: check-the-world for mic capture released on pagehide (#362)
- **Source:** a CrosswordChat session that audited the extension's microphone lifecycle.
- **Reason:** shipped as prose first and converted inside the same pull request, at the reviewer's
  asking: a check relieves every session's context where prose only relocates it. It is blocking
  because a mic left held after teardown is a real device leak.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded check owned by the web-speech-io skill, scoped to the whole tracked source
  rather than the diff - a repo that opens the mic and releases it nowhere is a standing leak
  however long ago it merged. Repo-wide presence of a `pagehide` handler satisfies it, since the
  release may live in whichever context owns the stream.
- **Rejected:** routing it to chrome-extension. This is the voice-I/O capture lifecycle, and bfcache
  and `pagehide` are general browser behaviour rather than MV3 mechanics.
- **Landed:** #362 (Closes #363) · pack version 1.

## 2026-08-14 · converted · Declared checks are JSON, one file per pack (#827)
- **Reason:** the declaration was a module of about seventeen lines that held nothing but data. A
  pack's declarations become one JSON file discovered structurally, so writing the declaration adds
  the check - no import, no manifest line. JSON cannot hold a comment, which enforces the
  no-comments-on-a-check rule by construction, and the check states its own case rather than
  deferring to a `doc` pointer.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a declaration in the web-speech-io skill's `declared-checks.json`, replacing the
  coded module. Severity and findings unchanged.
- **Landed:** #827 (Closes #826) · pack version 2.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

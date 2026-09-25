## 2026-09-15 · born · Canon prose to checks: a stale voice cache and an unstapled notarization (#2059)
- **Reason:** a module-scope `getVoices()` cache answers empty for the page's life, so every
  utterance falls back to the OS default voice with nothing thrown and nothing logged - the silent
  breach the pack's other call-site contracts exist to catch.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a declared check in `packs/web-speech/declared-checks.json`, blocking, shipped with
  `since: 2026-09-15` so it bites at its real severity once the two-week window closes. A file that
  refreshes from a `voiceschanged` listener is spared, comments are stripped first, and test
  scaffolding and built bundles are out of scope.
- **Rejected:** deleting the prose paragraph. It also covers a lazy memo inside a function, which
  the module-scope signature cannot see, so both stay.
- **Landed:** #2059 · pack version 60915.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

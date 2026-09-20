## 2026-09-01 · born · converted from references.md (check:declarative-content-set-icon)
- **Reason:** #777's finding: `declarativeContent.SetIcon` with the documented `path` option can
  silently leave the action icon unset — the rules are evaluated by the browser process, which
  needs raw pixels at registration time, and there is no throw and no console error to notice.
- **Mechanism:** a check
- **Retire when:** Reaffirm by re-testing `path` on a current Chrome; retire the check only if
  Chrome makes `path` work (or fail loudly) there.

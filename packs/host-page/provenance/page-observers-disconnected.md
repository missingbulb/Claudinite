## 2026-09-05 · born · converted from references.md (check:page-observers-disconnected)
- **Reason:** A DOM observer started on a page you do not own runs until you disconnect it or the
  document dies, and a single-page app's document does not die. Everything else that ends your
  feature ends nothing for the observer, so it keeps waking on every host mutation and holds its
  callback's whole closure alive. On a host page this is not merely a leak but the difference
  between "off" and "off but still watching" — work the user did not ask for on a page that is not
  yours.
- **Mechanism:** a check
- **Retire when:** Reaffirm while `MutationObserver` and friends require explicit teardown; retire
  if observers gain a lifetime tied to the code that made them.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-20 · born · Refuse a change that adds a long dash (#2174)
- **Source:** asked for by the owner after a JSON dump in #2167 rewrote a file's em dashes as
  escapes.
- **Reason:** the character arrives by accident, from a JSON round trip as much as from typing.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a work-scope declared check over added lines only, so the dashes the tree already
  carries are not the change's; the vendored mount and the test-file class are out of scope, since
  their fixtures legitimately carry the characters.
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #2174.

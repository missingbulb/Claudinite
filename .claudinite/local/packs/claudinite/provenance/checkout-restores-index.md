## 2026-09-06 · born · converted from references.md (check:checkout-restores-index)
- **Reason:** #1010: `git checkout --` restores from the index, so it destroys uncommitted work in
  the same file just as thoroughly as the `.bak` above.
- **Mechanism:** a check

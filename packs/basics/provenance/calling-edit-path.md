## 2026-09-06 · born · converted from references.md (RULES-3)
- **Reason:** Re-probed 2026-09-15 across four paths, each created by a Bash `printf` or the `Write`
  tool and never read: a repo file and a scratchpad file both edited with no prior read, while a
  file under `/home/user/` refused with "File has not been read yet" until a session `Write` made it
  current. So the gate is the path's *root*, not any session write — the 2026-09-06 entry read a
  scratchpad exemption as a shell write counting, which sends a reader outside both roots to a shell
  write that does not unlock the edit.
- **Mechanism:** prose
- **Retire when:** Retire the wording if Edit starts demanding a read inside the working directory,
  or stops demanding one outside it.

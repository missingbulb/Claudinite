## 2026-08-11 · born · growth-promote: dedupe PR #740's rule additions and cut the language (#751)
- **Source:** the seven growth branches PR #740 merged, re-derived against current `main`.
- **Actor:** @missingbulb (owner).
- **Mechanism:** one of the same three harness-tool contracts in RULES.md.
- **Rejected:** patching #740's own branch. Its base was 40 commits behind `main` and edited a
  `RULES.md` that still had the engineering-practices bullets in a separate skill file, and its
  merge had left several lessons standing two and three times.
- **Landed:** #751.

## 2026-09-15 · reworded · Claudinite canon: rule revalidation (#2058)
- **Reason:** re-probed 2026-09-15 across four paths, each created by a Bash `printf` or the `Write`
  tool and never read: a repo file and a scratchpad file both edited with no prior read, while a
  file under `/home/user/` refused until a session `Write` made it current. The gate is the path's
  ROOT, not any session write.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Calling Edit on a path outside the working directory
  and the session scratchpad".
- **Retire when:** Edit starts demanding a read inside the working directory, or stops demanding one
  outside it.
- **Landed:** #2058 · pack version 60915.3.

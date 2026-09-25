## 2026-09-20 · born · Claudinite growth: extract lessons (#2127)
- **Source:** two growth-extract runs, over the 2026-09-18 and 2026-09-20 windows.
- **Reason:** the same mistake twice, two months apart: a diagnostic script chose the newest
  `.jsonl` across every project directory, which is always the running session's own file, and
  before that the capture derived the directory from a path slug a remote session's launch cwd does
  not match, so every capture there silently found nothing.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a blocking action guard on a Bash or Write payload carrying `mtime`, `projects` and
  `.jsonl` together, silent when it names the helper that searches by session id.
  .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #2127 (Refs #2119).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
